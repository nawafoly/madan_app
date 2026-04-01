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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BellRing,
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
  Lock,
  Mail,
  Phone,
  Rocket,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { doc, getDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import { AUDIT_ACTIONS, auditedSetDoc, buildAuditSource } from "@/lib/auditLog";
import {
  formatCurrencyEN,
  formatNumberEN,
  formatPercentEN,
} from "@/lib/formatters";
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
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime())
      ? parsed
      : null;
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

function formatProjectDate(value: any) {
  const date = toDateSafe(value);
  if (!date) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function toPastTenseNarrative(value: unknown) {
  const text = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  return text
    .replace(/فرصة استثمارية/g, "مشروع تم تنفيذه")
    .replace(/فرصة استثمار/g, "مشروع منجز")
    .replace(/فرصة/g, "مشروع")
    .replace(/قراءة سريعة للفرصة/g, "نظرة عامة على المشروع")
    .replace(/الخلاصة التنفيذية للاستثمار/g, "ملخص تنفيذي للمشروع")
    .replace(/يهدف إلى/g, "كان يهدف إلى")
    .replace(/تهدف إلى/g, "كانت تهدف إلى")
    .replace(/يهدف\b/g, "كان يهدف")
    .replace(/تهدف\b/g, "كانت تهدف")
    .replace(/يقدّم/g, "قدّم")
    .replace(/تقدّم/g, "قدّمت")
    .replace(/يوفّر/g, "وفّر")
    .replace(/توفر/g, "وفّرت")
    .replace(/يتيح/g, "أتاح")
    .replace(/تتيح/g, "أتاحت")
    .replace(/يعرض/g, "عرض")
    .replace(/يوضح/g, "أوضح")
    .replace(/يشرح/g, "شرح")
    .replace(/سيتم/g, "تم")
    .trim();
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
type Milestone = {
  title?: string;
  date?: string;
  status?: string;
  description?: string;
};
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
  const raw = String(value ?? "")
    .replace(/\r/g, "")
    .trim();
  if (!raw) return { lead: "", bullets: [] as string[] };

  const blocks = raw
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);

  const segments = (blocks.length > 1 ? blocks : raw.split(/[.!؟]+/))
    .map(item => item.replace(/\s+/g, " ").trim())
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
  const [successMode, setSuccessMode] = useState<"investment" | "prelaunch">(
    "investment"
  );

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
          setFormData(p => ({
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
          setFormData(p => ({
            ...p,
            name: p.name || user.displayName || "",
            email: p.email || user.email || "",
            phone: p.phone || "",
          }));
          return;
        }

        const p = snap.data() as any;
        setUserProfile(p);

        setFormData(prev => ({
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
  }, [
    project,
    flags.maintenanceMode,
    flags.hideVipProjects,
    flags.vipOnlyMode,
  ]);

  // Optional sections (render only if present)
  const gallery: string[] = useMemo(() => {
    const raw = project?.gallery;
    if (!raw) return [];
    if (Array.isArray(raw))
      return raw.map(x => normalizeCover(String(x || ""))).filter(Boolean);
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
    if (Array.isArray(raw))
      return raw.map(x => String(x || "").trim()).filter(Boolean);
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
    const done = milestones.filter(m => isMilestoneDone(m?.status)).length;
    return clamp((done / total) * 100, 0, 100);
  }, [milestones]);

  const progressMode: ProgressMode = String(
    project?.progressMode || "hybrid"
  ) as ProgressMode;

  const fundingW = clamp(
    safeNumber(project?.progressFundingWeight ?? 60),
    0,
    100
  );
  const milestonesW = clamp(
    safeNumber(project?.progressMilestonesWeight ?? 40),
    0,
    100
  );

  const progress = useMemo(() => {
    if (progressMode === "funding") return fundingProgress;
    if (progressMode === "milestones") return milestonesProgress;

    // hybrid
    const sum = fundingW + milestonesW || 100;
    const fw = fundingW / sum;
    const mw = milestonesW / sum;
    return clamp(fundingProgress * fw + milestonesProgress * mw, 0, 100);
  }, [
    progressMode,
    fundingProgress,
    milestonesProgress,
    fundingW,
    milestonesW,
  ]);

  // ✅ HERO MEDIA: صورة أولاً، وإذا ما فيه يرجع للفيديو
  const coverImage = useMemo(
    () => normalizeCover(project?.coverImage),
    [project?.coverImage]
  );

  const heroVideo =
    project?.videoUrl ||
    "https://cdn.coverr.co/videos/coverr-modern-architecture-1604/1080p.mp4";

  // ✅ FIX: labels ممكن تكون {ar,en} فلازم نحولها لنص
  const typeLabel = project?.projectType
    ? pickLabel(
        labels.projectTypes[project.projectType],
        "ar",
        project.projectType
      )
    : "";

  const statusLabel = project?.status
    ? pickLabel(labels.projectStatuses[project.status], "ar", project.status)
    : "";

  const overviewSource = useMemo(
    () =>
      project?.overviewAr ||
      project?.descriptionAr ||
      project?.description ||
      "",
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
  const investorsCountText = formatNumberEN(
    safeNumber(project?.investorsCount)
  );
  const projectEndDate =
    project?.plannedEndAt ||
    project?.actualEndAt ||
    project?.endDate ||
    project?.endAt ||
    null;
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

  const investmentDecisionItems = [
    {
      label: "الحد الأدنى",
      value: minimumInvestmentText,
      helper: "الحد الأدنى للدخول في الطلب",
      icon: Wallet,
      accentClass:
        "bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] text-slate-700",
    },
    {
      label: "العائد السنوي",
      value: annualReturnText,
      helper: "العائد المعلن على أساس سنوي",
      icon: TrendingUp,
      accentClass:
        "bg-[linear-gradient(180deg,rgba(15,118,110,0.08)_0%,rgba(255,255,255,1)_100%)] text-emerald-700",
    },
    {
      label: "مدة الاستثمار",
      value: durationText,
      helper: "المدة التقديرية للاستثمار",
      icon: Calendar,
      accentClass:
        "bg-[linear-gradient(180deg,rgba(15,23,42,0.06)_0%,rgba(255,255,255,1)_100%)] text-slate-700",
    },
    {
      label: "حالة المشروع",
      value: statusLabel || "غير محدد",
      helper: "الحالة الحالية للفرصة",
      icon: CheckCircle2,
      accentClass:
        "bg-[linear-gradient(180deg,rgba(242,174,48,0.12)_0%,rgba(255,255,255,1)_100%)] text-amber-700",
    },
  ] as const;

  const investmentTrustItems = [
    "إدارة احترافية",
    "عوائد مستقرة",
    "متوافق مع الشريعة",
    "تقارير دورية",
  ] as const;

  const projectStatusKey = String(project?.status || "")
    .trim()
    .toLowerCase();
  const isActiveProject = projectStatusKey === "published";
  const isUpcomingProject = projectStatusKey === "draft";
  const isClosedProject =
    projectStatusKey === "closed" || projectStatusKey === "completed";
  const projectTitle = project?.titleAr || project?.title || "—";
  const projectLocation = project?.locationAr || project?.location || "";
  const completedStatusLabel = "مكتمل";
  const hasVipTag =
    Boolean(project?.vipOnly) ||
    Boolean(project?.isVip) ||
    project?.projectType === "vip_exclusive";

  const completedMedia = useMemo(() => {
    const seen = new Set<string>();
    const media = [coverImage, ...gallery].filter(Boolean);

    return media.filter(src => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    });
  }, [coverImage, gallery]);

  const completedOverviewLead = useMemo(() => {
    const normalized = toPastTenseNarrative(overviewContent.lead || overviewSource);
    return (
      normalized ||
      "كان هذا المشروع ضمن المشاريع التي تم تنفيذها وإغلاقها، وتعرض هذه الصفحة خلاصته النهائية ومخرجاته الموثقة."
    );
  }, [overviewContent.lead, overviewSource]);

  const completedOverviewPoints = useMemo(
    () =>
      [
        typeLabel ? `اندرج المشروع ضمن فئة ${typeLabel}.` : "",
        projectLocation ? `تم تنفيذ المشروع في ${projectLocation}.` : "",
        project?.issueNumber ? `حمل المشروع الرقم #${project.issueNumber}.` : "",
        projectEndDate ? `اكتمل المشروع في ${formatProjectDate(projectEndDate)}.` : "",
      ].filter(Boolean),
    [project?.issueNumber, projectEndDate, projectLocation, typeLabel]
  );

  const completedResults = useMemo(() => {
    const fromHighlights = highlights
      .map(item => toPastTenseNarrative(item))
      .filter(Boolean);

    if (fromHighlights.length) return fromHighlights.slice(0, 6);

    const fromMilestones = milestones
      .map(milestone => {
        const title = String(milestone?.title || "").trim();
        const description = toPastTenseNarrative(milestone?.description);

        if (description) return description;
        if (title) return `تم إنجاز ${title}.`;
        return "";
      })
      .filter(Boolean);

    if (fromMilestones.length) return fromMilestones.slice(0, 6);

    return [
      projectEndDate
        ? `تم الوصول إلى المرحلة النهائية للمشروع بتاريخ ${formatProjectDate(projectEndDate)}.`
        : "تم الوصول إلى المرحلة النهائية للمشروع ضمن سجل المشاريع المكتملة.",
      projectLocation ? `اكتمل تنفيذ المشروع في ${projectLocation}.` : "",
      "أصبحت الصفحة مرجعًا بصريًا ومعلوماتيًا لنتائج المشروع بعد إقفاله.",
    ].filter(Boolean);
  }, [highlights, milestones, projectEndDate, projectLocation]);

  const completedOutputs = useMemo(() => {
    const outputs: Array<{ title: string; description: string; meta: string }> = [];

    milestones.slice(0, 2).forEach((milestone, index) => {
      const title = String(milestone?.title || "").trim();
      const description = toPastTenseNarrative(milestone?.description);

      if (!title && !description) return;

      outputs.push({
        title: title || `مخرج ${index + 1}`,
        description:
          description || "تم إنجاز هذه المرحلة ضمن المسار التنفيذي للمشروع.",
        meta: milestone?.date ? formatProjectDate(milestone.date) : "مرحلة منجزة",
      });
    });

    if (attachments.length > 0) {
      outputs.push({
        title: "توثيق المشروع",
        description: `تم إرفاق ${formatNumberEN(attachments.length)} ملفات مرتبطة بنتائج المشروع ومخرجاته النهائية.`,
        meta: "مستندات ومرفقات",
      });
    }

    if (completedMedia.length > 0) {
      outputs.push({
        title: "معرض بصري",
        description: `تم توثيق المشروع عبر ${formatNumberEN(completedMedia.length)} صورة أو أصل بصري يعرض الحالة النهائية.`,
        meta: "صور المشروع",
      });
    }

    if (!outputs.length) {
      outputs.push({
        title: "سجل المشروع",
        description:
          "تم حفظ هذا المشروع ضمن المشاريع المكتملة لعرض خلاصته النهائية ومخرجاته بعد التنفيذ.",
        meta: completedStatusLabel,
      });
    }

    return outputs.slice(0, 4);
  }, [attachments.length, completedMedia.length, milestones]);

  const completedFinalNotes = useMemo(() => {
    const notes = [
      project?.paymentScheduleAr
        ? toPastTenseNarrative(project.paymentScheduleAr)
        : "",
      project?.risksAr ? toPastTenseNarrative(project.risksAr) : "",
      project?.issueNumber
        ? `تم حفظ المشروع تحت الرقم المرجعي #${project.issueNumber} ضمن سجل المشاريع المكتملة.`
        : "",
    ].filter(Boolean);

    return notes.slice(0, 3);
  }, [project?.issueNumber, project?.paymentScheduleAr, project?.risksAr]);

  const completionContent = useMemo(() => {
    const raw = project?.completionContent;
    if (!raw || typeof raw !== "object") return null;

    return {
      overviewAr: String((raw as any).overviewAr || "").trim(),
      summaryAr: String((raw as any).summaryAr || "").trim(),
      resultsAr: Array.isArray((raw as any).resultsAr)
        ? (raw as any).resultsAr.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : [],
      outputs: Array.isArray((raw as any).outputs)
        ? (raw as any).outputs
            .map((item: any) => ({
              title: String(item?.titleAr || "").trim(),
              description: String(item?.descriptionAr || "").trim(),
              meta: String(item?.metaAr || "").trim(),
            }))
            .filter((item: { title: string; description: string; meta: string }) =>
              item.title || item.description || item.meta
            )
        : [],
      finalNotesAr: Array.isArray((raw as any).finalNotesAr)
        ? (raw as any).finalNotesAr
            .map((item: unknown) => String(item || "").trim())
            .filter(Boolean)
        : [],
      gallery: Array.isArray((raw as any).gallery)
        ? (raw as any).gallery
            .map((item: unknown) => normalizeCover(String(item || "")))
            .filter(Boolean)
        : [],
    };
  }, [project?.completionContent]);

  const hasExplicitCompletionContent = useMemo(
    () =>
      Boolean(
        completionContent &&
          (completionContent.overviewAr ||
            completionContent.summaryAr ||
            completionContent.resultsAr.length > 0 ||
            completionContent.outputs.length > 0 ||
            completionContent.finalNotesAr.length > 0 ||
            completionContent.gallery.length > 0)
      ),
    [completionContent]
  );

  const completionMediaData = useMemo(() => {
    const seen = new Set<string>();
    const media =
      completionContent?.gallery && completionContent.gallery.length > 0
        ? completionContent.gallery
        : completedMedia;

    return media.filter((src: string) => {
      if (!src || seen.has(src)) return false;
      seen.add(src);
      return true;
    });
  }, [completedMedia, completionContent?.gallery]);

  const completionSummaryText = useMemo(() => {
    if (completionContent?.summaryAr) return completionContent.summaryAr;
    if (completionContent?.overviewAr) {
      const parsed = parseOverviewContent(completionContent.overviewAr);
      return parsed.lead || completionContent.overviewAr;
    }
    return completedOverviewLead;
  }, [completedOverviewLead, completionContent?.overviewAr, completionContent?.summaryAr]);

  const completionOverviewItems = useMemo(() => {
    if (completionContent?.overviewAr) {
      const parsed = parseOverviewContent(completionContent.overviewAr);
      const items = [parsed.lead, ...parsed.bullets].filter(Boolean);
      if (items.length > 0) return items.slice(0, 4);
    }

    return completedOverviewPoints;
  }, [completedOverviewPoints, completionContent?.overviewAr]);

  const completionResultsData = useMemo(() => {
    if (completionContent?.resultsAr && completionContent.resultsAr.length > 0) {
      return completionContent.resultsAr.slice(0, 6);
    }
    return completedResults;
  }, [completedResults, completionContent?.resultsAr]);

  const completionOutputsData = useMemo(() => {
    if (completionContent?.outputs && completionContent.outputs.length > 0) {
      return completionContent.outputs.slice(0, 4);
    }

    const fallbackOutputs = [...completedOutputs];
    if (
      completionContent?.gallery &&
      completionContent.gallery.length > 0 &&
      !fallbackOutputs.some((item) => item.meta === "صور المشروع")
    ) {
      fallbackOutputs.unshift({
        title: "معرض بصري",
        description: `تم توثيق المشروع عبر ${formatNumberEN(completionContent.gallery.length)} صور تعرض الحالة النهائية.`,
        meta: "صور المشروع",
      });
    }

    return fallbackOutputs.slice(0, 4);
  }, [completedOutputs, completionContent?.gallery, completionContent?.outputs]);

  const completionFinalNotesData = useMemo(() => {
    if (completionContent?.finalNotesAr && completionContent.finalNotesAr.length > 0) {
      return completionContent.finalNotesAr.slice(0, 4);
    }
    return completedFinalNotes;
  }, [completedFinalNotes, completionContent?.finalNotesAr]);

  const stagedUpcomingItems = useMemo(() => {
    const fallbackTitles = ["دراسة", "ترخيص", "تجهيز"] as const;
    const fallbackStates = fallbackTitles.map((title, index) => {
      const threshold = (index + 1) * 33.34;
      const state =
        progress >= threshold ? "done" : progress >= index * 33.34 ? "current" : "upcoming";

      return {
        title,
        state: state as MilestoneState,
      };
    });

    if (milestones.length === 0) return fallbackStates;

    return milestones.slice(0, 3).map((milestone, index) => ({
      title: String(milestone?.title || "").trim() || fallbackTitles[index] || `مرحلة ${index + 1}`,
      state: getMilestoneState(milestone?.status),
    }));
  }, [milestones, progress]);

  const stateAwareTrustItems = isUpcomingProject
    ? ([
        "إشعار مباشر عند الإطلاق",
        "ملف أولي واضح للفرصة",
        "متابعة جاهزية المشروع",
        "تواصل مبكر مع فريق الاستثمار",
      ] as const)
    : isClosedProject
      ? ([
          "الاكتتاب مغلق حاليًا",
          "سجل أداء محفوظ داخل المنصة",
          "مؤشرات المشروع ما تزال متاحة للمراجعة",
          "عرض معلوماتي بدون خطوات استثمارية",
        ] as const)
      : investmentTrustItems;

  const successContent =
    successMode === "investment"
      ? {
          title: "تم إرسال طلب الاستثمار",
          description:
            "وصل طلبك إلى فريق الاستثمار، وسيتم التواصل معك بعد المراجعة لاستكمال الخطوات النظامية.",
        }
      : {
          title: "تم تسجيل اهتمامك",
          description:
            "سجّلنا اهتمامك بهذه الفرصة، وسنرسل لك إشعارًا فور فتح باب الاستثمار أو تحديث حالة الإطلاق.",
        };

  const submitProjectRequest = async ({
    requestType,
    amount,
    note,
    requireAmount,
    requireName,
    source,
    method,
    nextSuccessMode,
  }: {
    requestType: "investment_request" | "launch_interest";
    amount: number | null;
    note: string | null;
    requireAmount: boolean;
    requireName: boolean;
    source: string;
    method: string;
    nextSuccessMode: "investment" | "prelaunch";
  }) => {
    if (!project) return;

    try {
      setSending(true);
      setFormMessage({ type: null, text: "" });

      if (!user?.uid) {
        toast.error("الرجاء تسجيل الدخول أولاً");
        return;
      }

      const name = formData.name.trim();
      const email = formData.email.trim();
      const phone = formData.phone.trim();

      if (requireName && !name) {
        toast.error("الاسم مطلوب");
        return;
      }

      if (!email) {
        toast.error("البريد الإلكتروني مطلوب");
        return;
      }

      if (!phone) {
        toast.error("رقم الجوال مطلوب");
        return;
      }

      if (requireAmount && (!Number.isFinite(amount) || Number(amount) <= 0)) {
        toast.error("المبلغ مطلوب ويجب أن يكون أكبر من صفر");
        return;
      }

      const requestRef = doc(collection(db, "interest_requests"));
      const payload = {
        requestId: requestRef.id,
        type: requestType,
        projectId: project?.id || projectId,
        projectTitle: project?.titleAr || project?.title || "",

        investorUid: user.uid,
        userId: user.uid,
        createdByUid: user.uid,
        createdByEmail: user.email || email || null,
        investorEmail: email || user.email || null,
        investorName: name || null,
        investorPhone: phone || null,

        amount: requireAmount ? amount : null,
        status: "pending",
        stageRole: "review",
        stage: "review",
        note,

        projectSnapshot: {
          titleAr: project?.titleAr || null,
          title: project?.title || null,
          status: project?.status || null,
          minInvestment: project?.minInvestment ?? null,
          annualReturn: project?.annualReturn ?? null,
          duration: project?.duration ?? null,
        },
        userSnapshot: {
          uid: user.uid,
          displayName: name || null,
          email: email || null,
          phone: phone || null,
          isInvestor: userProfile?.isInvestor ?? false,
        },

        source,
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
          method,
        }),
        relatedIds: {
          requestId: requestRef.id,
          projectId: String(project?.id || projectId || ""),
          userId: user.uid,
        },
        message: `Created ${requestType} ${requestRef.id}`,
        meta: {
          projectName: project?.titleAr || project?.title || null,
          amount: requireAmount ? amount : null,
          requestCode: requestRef.id,
          requestType,
        },
        ignoreFields: ["updatedAt"],
      });

      setSuccessMode(nextSuccessMode);
      setIsInterestFormOpen(false);
      setIsSuccessOpen(true);
      setFormData(p => ({ ...p, estimatedAmount: "", message: "" }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isActiveProject) {
      toast.error("الاستثمار غير متاح لهذه الحالة");
      return;
    }

    const amount = Number(formData.estimatedAmount);
    await submitProjectRequest({
      requestType: "investment_request",
      amount: Number.isFinite(amount) ? amount : null,
      note: formData.message.trim() || null,
      requireAmount: true,
      requireName: false,
      source: "project_details",
      method: "create_request",
      nextSuccessMode: "investment",
    });
  };

  const handleLaunchInterestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUpcomingProject) {
      toast.error("تسجيل الاهتمام متاح فقط للمشاريع القادمة");
      return;
    }

    await submitProjectRequest({
      requestType: "launch_interest",
      amount: null,
      note: null,
      requireAmount: false,
      requireName: true,
      source: "project_prelaunch_interest",
      method: "register_launch_interest",
      nextSuccessMode: "prelaunch",
    });
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

  if (isClosedProject) {
    return (
      <div className="w-full bg-[#f4f7fb]">
        <section className="relative overflow-hidden bg-[#07111f] text-white">
          <div className="absolute inset-0">
            {completionMediaData[0] ? (
              <img
                src={completionMediaData[0]}
                alt={projectTitle}
                className="h-full w-full object-cover opacity-28"
              />
            ) : (
              <video
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-cover opacity-20"
                src={heroVideo}
              />
            )}
          </div>

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,31,0.52)_0%,rgba(7,17,31,0.66)_24%,rgba(7,17,31,0.88)_72%,rgba(7,17,31,0.96)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.12),transparent_25%)]" />

          <div className="container relative py-24 md:py-28">
            <div className="max-w-5xl space-y-8">
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full border border-emerald-300/24 bg-emerald-300/14 px-4 py-2 text-white">
                  {completedStatusLabel}
                </Badge>

                {typeLabel ? (
                  <Badge className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white/92 backdrop-blur-sm">
                    {typeLabel}
                  </Badge>
                ) : null}

                {hasVipTag ? (
                  <Badge className="rounded-full border border-amber-300/24 bg-amber-300/14 px-4 py-2 text-amber-100 backdrop-blur-sm">
                    VIP
                  </Badge>
                ) : null}

                {project?.issueNumber ? (
                  <Badge className="rounded-full border border-white/15 bg-black/20 px-4 py-2 text-white/90 backdrop-blur-sm">
                    #{project.issueNumber}
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72 backdrop-blur">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Project Results</span>
                </div>

                <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
                  {projectTitle}
                </h1>

                {projectLocation ? (
                  <div className="flex items-center gap-2 text-base text-white/78 md:text-lg">
                    <MapPin className="h-5 w-5" />
                    <span>{projectLocation}</span>
                  </div>
                ) : null}

                <p className="max-w-3xl text-base leading-8 text-white/74 md:text-lg">
                  {completionSummaryText}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[28px] border border-white/12 bg-white/10 p-5 backdrop-blur">
                  <div className="text-sm text-white/58">الحالة</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {completedStatusLabel}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/12 bg-white/10 p-5 backdrop-blur">
                  <div className="text-sm text-white/58">الموقع</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {projectLocation || "—"}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/12 bg-white/10 p-5 backdrop-blur">
                  <div className="text-sm text-white/58">رقم المشروع</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {project?.issueNumber ? `#${project.issueNumber}` : "—"}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/12 bg-white/10 p-5 backdrop-blur">
                  <div className="text-sm text-white/58">تاريخ الإقفال</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {projectEndDate ? formatProjectDate(projectEndDate) : "غير محدد"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-20 pt-10">
          <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_420px] lg:px-8">
            <div className="space-y-8">
              <Card className="overflow-hidden border-0 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <CardHeader className="border-b border-slate-100 pb-6">
                  <div className="space-y-3">
                    <Badge
                      variant="outline"
                      className="w-fit border-slate-200 bg-slate-50 text-slate-600"
                    >
                      نظرة عامة
                    </Badge>
                    <CardTitle className="text-3xl font-semibold tracking-tight">
                      نظرة عامة على المشروع
                    </CardTitle>
                    <CardDescription className="max-w-2xl">
                      قراءة موجزة للمشروع بعد اكتماله، تركّز على ما تم تنفيذه وكيف ظهر بصيغته النهائية.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-6 pt-6 lg:grid-cols-[1.1fr_0.9fr]">
                  {!hasExplicitCompletionContent ? (
                    <div className="rounded-[22px] border border-amber-200 bg-amber-50/80 p-4 text-sm leading-7 text-amber-800 lg:col-span-2">
                      لا توجد بيانات ختامية مخصصة لهذا المشروع بعد، لذلك يتم عرض ملخص بديل من
                      البيانات العامة المتوفرة.
                    </div>
                  ) : null}
                  <div className="rounded-[28px] bg-[#0f172a] p-6 text-white">
                    <div className="text-sm text-white/55">ملخص المشروع</div>
                    <p className="mt-4 text-lg leading-8 text-white/88">
                      {completionSummaryText}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {completionOverviewItems.map((item, idx) => (
                      <div
                        key={`${item}-${idx}`}
                        className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div className="text-sm leading-7 text-slate-700">
                          {item}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border border-slate-200/70 bg-white">
                <CardHeader className="border-b border-slate-100 pb-6">
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <CheckCircle2 className="w-7 h-7 text-primary" />
                    نتائج المشروع
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {completionResultsData.map((item: string, index: number) => (
                      <div
                        key={`${item}-${index}`}
                        className="rounded-[26px] border border-slate-200 bg-slate-50/70 p-5 shadow-sm"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div className="mt-4 text-sm leading-7 text-slate-700">
                          {item}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border border-slate-200/70 bg-white">
                <CardHeader className="border-b border-slate-100 pb-6">
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <FileText className="w-7 h-7 text-primary" />
                    مخرجات المشروع
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {completionOutputsData.map((output: (typeof completionOutputsData)[number]) => (
                      <div
                        key={output.title}
                        className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {output.meta}
                        </div>
                        <div className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                          {output.title}
                        </div>
                        <div className="mt-3 text-sm leading-7 text-slate-600">
                          {output.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {completionFinalNotesData.length > 0 && (
                <Card className="overflow-hidden border border-slate-200/70 bg-white">
                  <CardHeader className="border-b border-slate-100 pb-6">
                    <CardTitle className="text-3xl flex items-center gap-2">
                      <Shield className="w-7 h-7 text-primary" />
                      ملخص نهائي
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-6">
                    {completionFinalNotesData.map((note: string, index: number) => (
                      <div
                        key={`${note}-${index}`}
                        className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700"
                      >
                        {note}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            <aside className="mx-auto w-full max-w-[760px] space-y-6 lg:sticky lg:top-28 lg:max-w-none lg:self-start">
              {completionMediaData.length > 0 && (
                <Card className="overflow-hidden border border-slate-200/80 bg-white shadow-[0_24px_70px_-46px_rgba(15,23,42,0.32)]">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <Images className="h-6 w-6 text-primary" />
                      صور المشروع
                    </CardTitle>
                    <CardDescription>
                      عرض بصري للحالة النهائية للمشروع بعد اكتماله.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-6">
                    <div className="overflow-hidden rounded-[26px] border border-slate-200 aspect-[4/3]">
                      <img
                        src={completionMediaData[0]}
                        alt={projectTitle}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    {completionMediaData.length > 1 ? (
                      <div className="grid grid-cols-3 gap-3">
                        {completionMediaData.slice(1, 4).map((src: string, index: number) => (
                          <div
                            key={`${src}-${index}`}
                            className="overflow-hidden rounded-[20px] border border-slate-200 aspect-square"
                          >
                            <img
                              src={src}
                              alt={`${projectTitle}-${index + 2}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              )}

              {attachments.length > 0 && (
                <Card className="overflow-hidden border border-slate-200/80 bg-white shadow-[0_24px_70px_-46px_rgba(15,23,42,0.32)]">
                  <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <FileText className="h-6 w-6 text-primary" />
                      وثائق ومرفقات
                    </CardTitle>
                    <CardDescription>
                      ملفات مرتبطة بنتائج المشروع ومخرجاته النهائية.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-6">
                    {attachments.slice(0, 4).map((attachment, index) => {
                      const href = attachment?.url || attachment?.externalUrl || "";

                      return (
                        <div
                          key={`${getAttachmentName(attachment)}-${index}`}
                          className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">
                                {getAttachmentName(attachment)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {getAttachmentKind(attachment)}
                              </div>
                            </div>

                            {href ? (
                              <Button asChild variant="outline" size="sm" className="rounded-full px-4">
                                <a href={href} target="_blank" rel="noreferrer">
                                  عرض
                                </a>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>
        </section>
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
                  <div className="text-sm text-white/58">
                    العائد السنوي المتوقع
                  </div>
                  <div className="mt-3 text-5xl font-black tracking-tight text-[#f4c95d] md:text-6xl">
                    {annualReturnText}
                  </div>
                  <div className="mt-3 max-w-sm text-sm leading-7 text-white/60">
                    عرض تمهيدي يضع نسبة العائد في الصدارة ويعطي قراءة سريعة لما
                    سيدخله المستثمر قبل بدء الطلب.
                  </div>
                </div>

                {typeLabel && (
                  <div className="rounded-2xl border border-white/12 bg-black/15 px-4 py-3 text-center">
                    <div className="text-[11px] text-white/55">
                      نوع الاستثمار
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white">
                      {typeLabel}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-xs text-white/55">المبلغ المستهدف</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {targetAmountText}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-xs text-white/55">الحد الأدنى</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {minimumInvestmentText}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-xs text-white/55">مدة الاستثمار</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {durationText}
                  </div>
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
              <div className="mt-2 text-sm text-slate-500">
                المبلغ المطلوب للوصول إلى الهدف التمويلي.
              </div>
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
              <div className="mt-2 text-sm text-slate-500">
                عدد المشاركين الحاليين في هذا المشروع.
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200/80 bg-[#0f172a] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.25)]">
              <div className="text-sm text-white/55">الوقت المتبقي</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">
                {remainingTimeText}
              </div>
              <div className="mt-2 text-sm text-white/60">
                محسوب من تاريخ نهاية المشروع المخطط متى ما كان متاحًا.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section className="pb-20 pt-4">
        <div className="mx-auto grid w-full max-w-[1540px] gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)] lg:gap-10 lg:px-8 2xl:grid-cols-[minmax(0,1.7fr)_minmax(420px,0.98fr)]">
          {/* LEFT */}
          <div className="min-w-0 space-y-8">
            {/* Overview */}
            <Card className="overflow-hidden border-0 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <CardHeader className="border-b border-slate-100 pb-6">
                <div className="space-y-3">
                  <Badge
                    variant="outline"
                    className="w-fit border-slate-200 bg-slate-50 text-slate-600"
                  >
                    نظرة عامة
                  </Badge>
                  <CardTitle className="text-3xl font-semibold tracking-tight">
                    قراءة سريعة للفرصة
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    صياغة مختصرة تسهّل على المستثمر فهم الفكرة الرئيسية قبل
                    الدخول في التفاصيل.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 pt-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[28px] bg-[#0f172a] p-6 text-white">
                  <div className="text-sm text-white/55">الخلاصة التنفيذية</div>
                  <p className="mt-4 text-lg leading-8 text-white/88">
                    {overviewContent.lead ||
                      "لا توجد مقدمة تفصيلية متاحة لهذا المشروع حالياً."}
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
                      <div className="text-sm leading-7 text-slate-700">
                        {item}
                      </div>
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
                        <div className="mt-4 text-sm leading-7 text-slate-700">
                          {t}
                        </div>
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
                        <div
                          key={idx}
                          className="relative pb-8 pr-12 last:pb-0"
                        >
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

                          <div
                            className={cn(
                              "rounded-[28px] border p-5",
                              milestoneUi.cardClass
                            )}
                          >
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
                                <Badge className={milestoneUi.badgeClass}>
                                  {milestoneUi.label}
                                </Badge>
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
                    const externalUrl = (a?.externalUrl || "")
                      .toString()
                      .trim();
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

                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="rounded-full px-4"
                          >
                            <a
                              href={primaryHref}
                              target="_blank"
                              rel="noreferrer"
                            >
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
                      <div
                        key={idx}
                        className="relative overflow-hidden rounded-2xl border aspect-[4/3]"
                      >
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
          <aside className="mx-auto w-full max-w-[760px] lg:max-w-none">
            <div className="lg:sticky lg:top-28">
              <Card className="w-full gap-0 overflow-hidden border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] py-0 shadow-[0_34px_95px_-48px_rgba(15,23,42,0.38)]">
                <CardHeader className="relative overflow-hidden bg-[linear-gradient(145deg,#07111f_0%,#102544_52%,#1b446d_100%)] pb-8 text-white sm:pb-9">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.18),transparent_30%)]" />
                  <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_1px)] [background-size:18px_18px]" />

                  <div className="relative z-10 space-y-4">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12">
                        <TrendingUp className="h-4 w-4" />
                      </span>
                      <span>Decision Panel</span>
                    </div>

                    <div className="space-y-2">
                      <CardTitle className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                        ملخص الاستثمار
                      </CardTitle>
                      <CardDescription className="max-w-md text-sm leading-7 text-white/72">
                        {isActiveProject
                          ? "راجع الأساسيات بسرعة، ثم انتقل مباشرة إلى إرسال طلب الاستثمار من نفس اللوحة."
                          : isUpcomingProject
                            ? "لوحة تمهيدية تشرح جاهزية الفرصة وتسمح لك بتسجيل اهتمامك قبل فتح باب الاستثمار."
                            : "لوحة معلومات هادئة توضّح حالة المشروع النهائية بدون أي خطوات استثمارية نشطة."}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-8 p-6 sm:p-7 lg:p-8">
                  <section className="space-y-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-950">
                        صورة القرار
                      </div>
                      <div className="text-sm text-slate-500">
                        أهم المعلومات التي يحتاجها المستثمر قبل بدء الطلب.
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {investmentDecisionItems.map(item => {
                        const Icon = item.icon;

                        return (
                          <div
                            key={item.label}
                            className="rounded-[24px] bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_18px_40px_-34px_rgba(15,23,42,0.38)] ring-1 ring-slate-200/80"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold tracking-[0.12em] text-slate-500">
                                  {item.label}
                                </div>
                                <div className="mt-3 text-[1.65rem] font-semibold tracking-tight text-slate-950">
                                  {item.value}
                                </div>
                              </div>

                              <span
                                className={cn(
                                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                                  item.accentClass
                                )}
                              >
                                <Icon className="h-5 w-5" />
                              </span>
                            </div>

                            <div className="mt-3 text-xs leading-6 text-slate-500">
                              {item.helper}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-[30px] bg-[linear-gradient(145deg,#07111f_0%,#102544_52%,#173c60_100%)] p-5 text-white shadow-[0_28px_70px_-44px_rgba(2,6,23,0.92)] sm:p-6">
                    <div className="space-y-2">
                      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/68 backdrop-blur">
                        {isActiveProject ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : isUpcomingProject ? (
                          <BellRing className="h-4 w-4" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                        <span>
                          {isActiveProject
                            ? "Active Investment"
                            : isUpcomingProject
                              ? "Pre-Investment"
                              : "Closed Offer"}
                        </span>
                      </div>
                      <div className="text-2xl font-semibold tracking-tight">
                        {isActiveProject
                          ? "ابدأ طلب الاستثمار الآن"
                          : isUpcomingProject
                            ? "كن أول المستثمرين عند الإطلاق"
                            : projectStatusKey === "completed"
                              ? "المشروع مكتمل"
                              : "تم إغلاق الاكتتاب"}
                      </div>
                      <p className="text-sm leading-7 text-white/72">
                        {isActiveProject
                          ? "هذه الفرصة مفتوحة للاستثمار حاليًا. حدّد مبلغك التقديري ثم افتح المودال لإرسال الطلب بشكل احترافي وواضح."
                          : isUpcomingProject
                            ? "هذا المشروع ما يزال في مرحلة الإطلاق. يمكنك متابعة جاهزيته الآن وتسجيل اهتمامك ليصلك إشعار مباشر عند بدء الاستثمار."
                            : "هذه الفرصة لم تعد متاحة للاستثمار المباشر. تبقى الصفحة مرجعًا معلوماتيًا لمراجعة الحالة والمؤشرات النهائية."}
                      </p>
                    </div>

                    {isActiveProject ? (
                      <div className="mt-5 rounded-[26px] border border-white/12 bg-white/10 p-4 shadow-inner backdrop-blur">
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_168px] sm:items-end">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/62">
                              مبلغك التقديري
                            </Label>
                            <Input
                              type="number"
                              value={formData.estimatedAmount}
                              onChange={e =>
                                setFormData({
                                  ...formData,
                                  estimatedAmount: e.target.value,
                                })
                              }
                              placeholder={minimumInvestmentText}
                              className="h-14 rounded-2xl border-white/12 bg-white text-base font-medium text-slate-950 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.55)] focus-visible:ring-2 focus-visible:ring-[#f2ae30]"
                            />
                            <div className="text-xs leading-6 text-white/60">
                              يمكنك تعديل المبلغ مرة أخرى داخل المودال قبل
                              الإرسال النهائي.
                            </div>
                          </div>

                          <div className="rounded-[24px] border border-white/12 bg-black/15 p-4 text-right">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                              الحد الأدنى
                            </div>
                            <div className="mt-2 text-xl font-semibold text-white">
                              {minimumInvestmentText}
                            </div>
                            <div className="mt-1 text-xs text-white/58">
                              الحد الأدنى للدخول في الطلب
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : isUpcomingProject ? (
                      <div className="mt-5 rounded-[26px] border border-white/12 bg-white/10 p-4 shadow-inner backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/56">
                              جاهزية الإطلاق
                            </div>
                            <div className="mt-1 text-2xl font-semibold text-white">
                              {progressPercentageText}
                            </div>
                          </div>
                          <div className="rounded-full border border-white/12 bg-black/15 px-3 py-1.5 text-sm text-white/78">
                            قيد الإطلاق
                          </div>
                        </div>

                        <div
                          className="relative mt-4 h-3 overflow-hidden rounded-full border border-white/12 bg-white/12"
                          aria-label="launch-readiness"
                          role="progressbar"
                          aria-valuenow={Math.round(progress)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="absolute inset-y-0 right-0 rounded-full"
                            style={{
                              width: `${progress > 0 ? Math.max(progress, 8) : 0}%`,
                              background:
                                "linear-gradient(90deg, rgba(242,174,48,1) 0%, rgba(244,201,93,1) 45%, rgba(255,255,255,0.94) 100%)",
                              boxShadow: "0 12px 24px rgba(242,174,48,0.35)",
                            }}
                          />
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          {stagedUpcomingItems.map((item, index) => {
                            const ui = getMilestoneStateUi(item.state);

                            return (
                              <div
                                key={item.title}
                                className="rounded-[22px] border border-white/12 bg-black/15 p-4"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-white">
                                    {index + 1}
                                  </span>
                                  <span className="text-sm font-medium text-white">
                                    {item.title}
                                  </span>
                                </div>
                                <div className="mt-3 text-xs leading-6 text-white/60">
                                  {ui.label}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-[26px] border border-white/12 bg-white/10 p-4 shadow-inner backdrop-blur">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[22px] border border-white/12 bg-black/15 p-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                              الحالة
                            </div>
                            <div className="mt-2 text-lg font-semibold text-white">
                              {statusLabel || "مغلق"}
                            </div>
                          </div>
                          <div className="rounded-[22px] border border-white/12 bg-black/15 p-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                              التمويل الحالي
                            </div>
                            <div className="mt-2 text-lg font-semibold text-white">
                              {currentAmountText}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {(isActiveProject || isUpcomingProject) && (
                      <Dialog
                        open={isInterestFormOpen}
                        onOpenChange={open => {
                          setIsInterestFormOpen(open);
                          if (open) setFormMessage({ type: null, text: "" });
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="lg"
                            className="mt-5 h-14 w-full rounded-2xl bg-[linear-gradient(135deg,#f2ae30_0%,#d9961f_100%)] text-base font-semibold text-slate-950 shadow-[0_22px_50px_-24px_rgba(242,174,48,0.72)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.03]"
                          >
                            {isActiveProject
                              ? "ابدأ طلب الاستثمار"
                              : "أرغب بالاستثمار عند الإطلاق"}
                            <ArrowRight className="mr-2 h-5 w-5" />
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-[760px] overflow-hidden border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-0 shadow-[0_40px_120px_-52px_rgba(15,23,42,0.55)]">
                          <DialogHeader className="relative overflow-hidden bg-[linear-gradient(145deg,#07111f_0%,#102544_52%,#1b446d_100%)] px-6 pb-6 pt-6 text-white sm:px-8 sm:pb-7 sm:pt-7">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.18),transparent_30%)]" />
                            <div className="relative z-10 space-y-3">
                              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/78 backdrop-blur">
                                {isActiveProject ? (
                                  <Rocket className="h-4 w-4" />
                                ) : (
                                  <BellRing className="h-4 w-4" />
                                )}
                                <span>
                                  {isActiveProject
                                    ? "Investment Request"
                                    : "Launch Interest"}
                                </span>
                              </div>
                              <DialogTitle className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                                {isActiveProject
                                  ? "ابدأ طلب الاستثمار"
                                  : "سجل اهتمامك بالفرصة"}
                              </DialogTitle>
                              <DialogDescription className="max-w-2xl text-sm leading-7 text-white/72">
                                {isActiveProject
                                  ? "أكمل بيانات التواصل وحدّد رغبتك الاستثمارية، ثم سيعود إليك فريق الاستثمار لمواءمة الطلب مع متطلبات المشروع."
                                  : "هذه الفرصة لم تفتح بعد للاستثمار. اترك بياناتك ليصلك إشعار مباشرة عند الإطلاق."}
                              </DialogDescription>
                            </div>
                          </DialogHeader>

                          <div className="space-y-6 px-6 pb-6 pt-6 sm:px-8 sm:pb-8">
                            <div className="grid gap-3 rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.32)] sm:grid-cols-3">
                              <div className="rounded-[20px] bg-slate-50/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  المشروع
                                </div>
                                <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                                  {project.titleAr || project.title || "—"}
                                </div>
                              </div>
                              <div className="rounded-[20px] bg-slate-50/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  {isActiveProject
                                    ? "المبلغ التقديري"
                                    : "الجاهزية"}
                                </div>
                                <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                                  {isActiveProject
                                    ? formData.estimatedAmount
                                      ? fmtSAR(formData.estimatedAmount)
                                      : "لم يتم تحديده بعد"
                                    : progressPercentageText}
                                </div>
                              </div>
                              <div className="rounded-[20px] bg-slate-50/90 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  حالة المشروع
                                </div>
                                <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                                  {statusLabel || "غير محدد"}
                                </div>
                              </div>
                            </div>

                            <form
                              onSubmit={
                                isActiveProject
                                  ? handleSubmit
                                  : handleLaunchInterestSubmit
                              }
                              className="space-y-6"
                            >
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                  <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <UserRound className="h-4 w-4 text-slate-400" />
                                    الاسم
                                  </Label>
                                  <Input
                                    value={formData.name}
                                    onChange={e =>
                                      setFormData({
                                        ...formData,
                                        name: e.target.value,
                                      })
                                    }
                                    required={isUpcomingProject}
                                    placeholder="اسمك الكامل"
                                    className="h-12 rounded-2xl border-slate-200 bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <Mail className="h-4 w-4 text-slate-400" />
                                    البريد الإلكتروني
                                  </Label>
                                  <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={e =>
                                      setFormData({
                                        ...formData,
                                        email: e.target.value,
                                      })
                                    }
                                    required
                                    className="h-12 rounded-2xl border-slate-200 bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <Phone className="h-4 w-4 text-slate-400" />
                                    رقم الجوال
                                  </Label>
                                  <Input
                                    value={formData.phone}
                                    onChange={e =>
                                      setFormData({
                                        ...formData,
                                        phone: e.target.value,
                                      })
                                    }
                                    required
                                    placeholder="05xxxxxxxx"
                                    className="h-12 rounded-2xl border-slate-200 bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                                  />
                                </div>

                                {isActiveProject ? (
                                  <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                      <Wallet className="h-4 w-4 text-slate-400" />
                                      المبلغ التقديري
                                    </Label>
                                    <Input
                                      type="number"
                                      value={formData.estimatedAmount}
                                      onChange={e =>
                                        setFormData({
                                          ...formData,
                                          estimatedAmount: e.target.value,
                                        })
                                      }
                                      required
                                      className="h-12 rounded-2xl border-slate-200 bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                                    />
                                  </div>
                                ) : null}
                              </div>

                              {isActiveProject ? (
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium text-slate-700">
                                    ملاحظات إضافية
                                  </Label>
                                  <Textarea
                                    rows={4}
                                    value={formData.message}
                                    onChange={e =>
                                      setFormData({
                                        ...formData,
                                        message: e.target.value,
                                      })
                                    }
                                    placeholder="أي تفاصيل إضافية تساعد فريق الاستثمار على فهم اهتمامك"
                                    className="min-h-[132px] rounded-[22px] border-slate-200 bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                                  />
                                </div>
                              ) : null}

                              {formMessage.text ? (
                                <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                                  {formMessage.text}
                                </div>
                              ) : null}

                              <Button
                                type="submit"
                                className="h-14 w-full rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#13243b_100%)] text-base font-semibold text-white shadow-[0_24px_50px_-28px_rgba(15,23,42,0.72)] transition-all hover:-translate-y-0.5 hover:brightness-[1.03]"
                                disabled={sending}
                              >
                                {sending
                                  ? isActiveProject
                                    ? "جاري إرسال الطلب..."
                                    : "جاري تسجيل الاهتمام..."
                                  : isActiveProject
                                    ? "إرسال طلب الاستثمار"
                                    : "أرغب بالاستثمار عند الإطلاق"}
                              </Button>
                            </form>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}

                    <div className="mt-3 flex items-start gap-2 text-xs leading-6 text-white/62">
                      {isUpcomingProject ? (
                        <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : isClosedProject ? (
                        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <span>
                        {isActiveProject
                          ? "إرسال الطلب لا يعني إتمام الاستثمار مباشرة، بل بدء مراجعة الفرصة ومواءمتها مع ملفك الاستثماري."
                          : isUpcomingProject
                            ? "لا يوجد اكتتاب مفتوح بعد لهذه الفرصة. سيتم إبلاغك مباشرة عند الانتقال إلى مرحلة الاستثمار الفعلي."
                            : "تم إيقاف أي خطوات استثمارية أو نماذج طلب لهذا المشروع، وتبقى الصفحة مرجعًا معلوماتيًا فقط."}
                      </span>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-950">
                        {isClosedProject ? "مؤشرات مرجعية" : "عوامل الثقة"}
                      </div>
                      <div className="text-sm text-slate-500">
                        {isUpcomingProject
                          ? "إشارات واضحة تشرح لماذا تستحق الفرصة المتابعة قبل الإطلاق."
                          : isClosedProject
                            ? "طبقة معلومات هادئة توضّح ما الذي يمكن الاستفادة منه بعد إغلاق الاكتتاب."
                            : "مؤشرات سريعة تدعم قرارك قبل المتابعة."}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {stateAwareTrustItems.map(item => (
                        <div
                          key={item}
                          className="flex items-center gap-3 rounded-[22px] bg-slate-50/90 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                            <CheckCircle2 className="h-5 w-5" />
                          </span>
                          <span className="text-sm font-medium text-slate-700">
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div>
                    <Link href="/projects">
                      <Button
                        variant="outline"
                        className="w-full rounded-2xl border-slate-200 bg-white/90 py-6 text-slate-700 hover:bg-slate-50"
                      >
                        العودة للمشاريع
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </aside>
        </div>
      </section>

      {/* ✅ SUCCESS MODAL (مستقل) */}
      <Dialog
        open={isSuccessOpen}
        onOpenChange={open => {
          setIsSuccessOpen(open);
          // ✅ لو قفلناه نرجع الرسائل لحالتها
          if (!open) setFormMessage({ type: null, text: "" });
        }}
      >
      <DialogContent className="max-w-[560px] overflow-hidden border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-0 shadow-[0_36px_100px_-48px_rgba(15,23,42,0.55)]">
        <DialogHeader className="relative overflow-hidden bg-[linear-gradient(145deg,#07111f_0%,#102544_52%,#1b446d_100%)] px-6 pb-6 pt-6 text-white sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.18),transparent_30%)]" />
          <div className="relative z-10 space-y-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/78 backdrop-blur">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {successMode === "investment"
                  ? "Request Delivered"
                  : "Interest Registered"}
              </span>
            </div>
            <DialogTitle className="text-2xl font-semibold tracking-tight text-white">
              {successContent.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-7 text-white/72">
              {successContent.description}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6 pt-6 sm:px-8 sm:pb-8">
          <div className="rounded-[24px] border border-emerald-200/80 bg-emerald-50 px-4 py-4 text-sm leading-7 text-emerald-900">
            {successMode === "investment"
              ? "احتفظ بوسائل التواصل محدثة في حسابك، لأن الفريق قد يتواصل معك سريعًا لاستكمال الخطوات التالية."
              : "بمجرد انتقال المشروع من مرحلة الإطلاق إلى الاستثمار الفعلي، ستصلك أول أولوية في الإشعار والمتابعة."}
          </div>

          <Button
            className="h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#13243b_100%)] text-white"
            onClick={() => setIsSuccessOpen(false)}
          >
            تم
          </Button>
        </div>
      </DialogContent>
      </Dialog>
    </div>
  );
}
