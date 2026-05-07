// client/src/pages/admin/EditProject.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRoute, useLocation } from "wouter";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import {
  AUDIT_ACTIONS,
  buildAuditSource,
  runAuditedOperation,
} from "@/lib/auditLog";
import { reserveNextBusinessId } from "@/lib/businessIds";
import { uploadInvestmentDocument } from "@/lib/documentUploadService";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Eye,
  FileImage,
  FolderKanban,
  RotateCcw,
  Save,
} from "lucide-react";
import { formatDateTimeEN } from "@/lib/formatters";
import { CreateProjectUi } from "./create-project/CreateProjectUi";
import {
  FINAL_SETTINGS_SECTION_ID,
  SECTION_DEFINITIONS,
  buildCoverageAmounts,
  buildFinalSettingsMeta,
  buildSectionStatusMap,
  buildCompletionContentPayload,
  normalizeProjectBuilderSectionId,
  projectTypeLabels,
  serializeProjectEditorSnapshot,
  statusLabels,
  vipTierLabels,
  type FormDataState,
  type ProjectEditorSnapshot,
  type SummaryMetric,
} from "./create-project/shared";

type ProjectType = "sukuk" | "land_development" | "vip_exclusive";
type ProjectStatus = "draft" | "published" | "closed" | "completed";
type VipTier = "none" | "silver" | "gold" | "platinum";
type ProgressMode = "funding" | "milestones" | "hybrid";

function cleanStr(v: any) {
  return String(v ?? "").trim();
}
function toNumOrNull(v: any) {
  const s = cleanStr(v).replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toNumOrZero(v: any) {
  const n = toNumOrNull(v);
  return n == null ? 0 : n;
}

function splitLines(text: string) {
  return cleanStr(text)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function safeDateLabel(v: any) {
  try {
    if (!v) return "—";
    if (typeof v?.toDate === "function") return formatDateTimeEN(v.toDate());
    if (v instanceof Date) return formatDateTimeEN(v);
    if (typeof v === "string" || typeof v === "number")
      return formatDateTimeEN(new Date(v));
    return "—";
  } catch {
    return "—";
  }
}

type Attachment = { name?: string; url?: string; externalUrl?: string };
type Milestone = { title?: string; date?: string; status?: string; description?: string };
type Faq = { q?: string; a?: string };
type CompletionOutput = { titleAr?: string; descriptionAr?: string; metaAr?: string };
type CompletionOutputRow = { titleAr: string; descriptionAr: string; metaAr: string };

type ParseResult<T> = { items: T[]; errors: string[] };

type AttachmentRow = { name: string; url: string; externalUrl: string; uploading?: boolean };
type MilestoneRow = { title: string; date: string; status: string; description: string };
type FaqRow = { q: string; a: string };

const newAttachmentRow = (): AttachmentRow => ({ name: "", url: "", externalUrl: "" });
const newMilestoneRow = (): MilestoneRow => ({
  title: "",
  date: "",
  status: "",
  description: "",
});
const newFaqRow = (): FaqRow => ({ q: "", a: "" });
const newCompletionOutputRow = (): CompletionOutputRow => ({
  titleAr: "",
  descriptionAr: "",
  metaAr: "",
});

function attachmentRowsFromItems(items: Attachment[]): AttachmentRow[] {
  const rows = items
    .map((item) => ({
      name: cleanStr(item?.name),
      url: cleanStr(item?.url),
      externalUrl: cleanStr(item?.externalUrl),
      uploading: false,
    }))
    .filter((row) => row.name || row.url || row.externalUrl);
  return rows.length ? rows : [newAttachmentRow()];
}

function milestoneRowsFromItems(items: Milestone[]): MilestoneRow[] {
  const rows = items
    .map((item) => ({
      title: cleanStr(item?.title),
      date: cleanStr(item?.date),
      status: cleanStr(item?.status),
      description: cleanStr(item?.description),
    }))
    .filter((row) => row.title || row.date || row.status || row.description);
  return rows.length ? rows : [newMilestoneRow()];
}

function faqRowsFromItems(items: Faq[]): FaqRow[] {
  const rows = items
    .map((item) => ({
      q: cleanStr(item?.q),
      a: cleanStr(item?.a),
    }))
    .filter((row) => row.q || row.a);
  return rows.length ? rows : [newFaqRow()];
}

function completionOutputRowsFromItems(items: CompletionOutput[]): CompletionOutputRow[] {
  const rows = items
    .map((item) => ({
      titleAr: cleanStr(item?.titleAr),
      descriptionAr: cleanStr(item?.descriptionAr),
      metaAr: cleanStr(item?.metaAr),
    }))
    .filter((row) => row.titleAr || row.descriptionAr || row.metaAr);
  return rows.length ? rows : [newCompletionOutputRow()];
}

function parseAttachmentRows(rows: AttachmentRow[]): ParseResult<Attachment> {
  const items: Attachment[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const name = cleanStr(row.name);
    const fileUrl = cleanStr(row.url);
    const externalUrl = cleanStr(row.externalUrl);
    if (!name && !fileUrl && !externalUrl) return;
    if (!fileUrl && !externalUrl) {
      errors.push(`المرفق ${idx + 1}: أضف ملفًا أو رابطًا خارجيًا على الأقل.`);
      return;
    }
    items.push({
      name: name || `مرفق ${idx + 1}`,
      ...(fileUrl ? { url: fileUrl } : {}),
      ...(externalUrl ? { externalUrl } : {}),
    });
  });

  return { items, errors };
}

function parseMilestoneRows(rows: MilestoneRow[]): ParseResult<Milestone> {
  const items: Milestone[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const title = cleanStr(row.title);
    const date = cleanStr(row.date);
    const status = cleanStr(row.status);
    const description = cleanStr(row.description);

    if (!title && !date && !status && !description) return;
    if (!title) {
      errors.push(`المرحلة ${idx + 1}: العنوان مطلوب.`);
      return;
    }

    items.push({
      title,
      ...(date ? { date } : {}),
      ...(status ? { status } : {}),
      ...(description ? { description } : {}),
    });
  });

  return { items, errors };
}

function parseFaqRows(rows: FaqRow[]): ParseResult<Faq> {
  const items: Faq[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const q = cleanStr(row.q);
    const a = cleanStr(row.a);
    if (!q && !a) return;
    if (!q) {
      errors.push(`سؤال FAQ رقم ${idx + 1}: السؤال مطلوب.`);
      return;
    }
    items.push(a ? { q, a } : { q });
  });

  return { items, errors };
}

function parseCompletionOutputRows(rows: CompletionOutputRow[]): ParseResult<CompletionOutput> {
  const items: CompletionOutput[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const titleAr = cleanStr(row.titleAr);
    const descriptionAr = cleanStr(row.descriptionAr);
    const metaAr = cleanStr(row.metaAr);

    if (!titleAr && !descriptionAr && !metaAr) return;
    if (!titleAr) {
      errors.push(`مخرج المشروع ${idx + 1}: العنوان مطلوب.`);
      return;
    }
    if (!descriptionAr) {
      errors.push(`مخرج المشروع ${idx + 1}: الوصف مطلوب.`);
      return;
    }

    items.push({
      titleAr,
      descriptionAr,
      ...(metaAr ? { metaAr } : {}),
    });
  });

  return { items, errors };
}

export default function EditProject() {
  const [, params] = useRoute("/admin/projects/:id/edit");
  const [, setLocation] = useLocation();
  const projectId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [completionGalleryUploading, setCompletionGalleryUploading] = useState(false);
  const [projectExists, setProjectExists] = useState(true);
  const [activeSection, setActiveSection] = useState(SECTION_DEFINITIONS[0]?.id ?? "basic");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [projectBusinessId, setProjectBusinessId] = useState("");

  const [meta, setMeta] = useState<{ createdAt?: any; updatedAt?: any }>({});

  const [formData, setFormData] = useState<FormDataState>({
    titleAr: "",
    titleEn: "",

    descriptionAr: "",
    descriptionEn: "",

    projectType: "sukuk" as ProjectType,
    status: "draft" as ProjectStatus,
    issueNumber: "",

    locationAr: "",
    locationEn: "",

    coverImage: "",
    galleryText: "", 
    completionOverviewAr: "",
    completionSummaryAr: "",
    completionGalleryText: "",

    targetAmount: "",
    currentAmount: "",
    coverageRate: "0",
    investmentsAmount: "0",
    minInvestment: "",
    annualReturn: "",
    duration: "",
    investorsCount: "",

    featured: "false" as "true" | "false",
    isVip: "false" as "true" | "false",
    vipTier: "none" as VipTier,

    progressMode: "hybrid" as ProgressMode,
    progressFundingWeight: "60",
    progressMilestonesWeight: "40",
  });

  const galleryUrls = useMemo(() => splitLines(formData.galleryText), [formData.galleryText]);
  const completionGalleryUrls = useMemo(
    () => splitLines(formData.completionGalleryText),
    [formData.completionGalleryText]
  );
  const [highlightRows, setHighlightRows] = useState<string[]>([""]);
  const [attachmentRows, setAttachmentRows] = useState<AttachmentRow[]>([
    newAttachmentRow(),
  ]);
  const [milestoneRows, setMilestoneRows] = useState<MilestoneRow[]>([
    newMilestoneRow(),
  ]);
  const [faqRows, setFaqRows] = useState<FaqRow[]>([newFaqRow()]);
  const [completionResultRows, setCompletionResultRows] = useState<string[]>([""]);
  const [completionOutputRows, setCompletionOutputRows] = useState<CompletionOutputRow[]>([
    newCompletionOutputRow(),
  ]);
  const [completionFinalNoteRows, setCompletionFinalNoteRows] = useState<string[]>([""]);
  const filledHighlights = useMemo(
    () => highlightRows.filter((item) => cleanStr(item)).length,
    [highlightRows]
  );
  const filledAttachments = useMemo(
    () =>
      attachmentRows.filter(
        (row) => cleanStr(row.name) || cleanStr(row.url) || cleanStr(row.externalUrl)
      ).length,
    [attachmentRows]
  );
  const filledMilestones = useMemo(
    () =>
      milestoneRows.filter(
        (row) =>
          cleanStr(row.title) ||
          cleanStr(row.date) ||
          cleanStr(row.status) ||
          cleanStr(row.description)
      ).length,
    [milestoneRows]
  );
  const filledFaq = useMemo(
    () => faqRows.filter((row) => cleanStr(row.q) || cleanStr(row.a)).length,
    [faqRows]
  );
  const filledCompletionResults = useMemo(
    () => completionResultRows.filter((item) => cleanStr(item)).length,
    [completionResultRows]
  );
  const filledCompletionOutputs = useMemo(
    () =>
      completionOutputRows.filter(
        (row) => cleanStr(row.titleAr) || cleanStr(row.descriptionAr) || cleanStr(row.metaAr)
      ).length,
    [completionOutputRows]
  );
  const filledCompletionFinalNotes = useMemo(
    () => completionFinalNoteRows.filter((item) => cleanStr(item)).length,
    [completionFinalNoteRows]
  );
  const requiredReady = useMemo(
    () =>
      [formData.titleAr, formData.descriptionAr, formData.locationAr, formData.coverImage].filter(
        (value) => cleanStr(value)
      ).length,
    [formData.coverImage, formData.descriptionAr, formData.locationAr, formData.titleAr]
  );
  const totalAssets = useMemo(
    () =>
      (cleanStr(formData.coverImage) ? 1 : 0) +
      galleryUrls.length +
      completionGalleryUrls.length +
      filledAttachments,
    [completionGalleryUrls.length, filledAttachments, formData.coverImage, galleryUrls.length]
  );
  const progressWeightsTotal = useMemo(
    () =>
      toNumOrZero(formData.progressFundingWeight) +
      toNumOrZero(formData.progressMilestonesWeight),
    [formData.progressFundingWeight, formData.progressMilestonesWeight]
  );
  const hasUploadingAttachment = attachmentRows.some((row) => row.uploading);
  const isBusy =
    saving ||
    coverUploading ||
    galleryUploading ||
    completionGalleryUploading ||
    hasUploadingAttachment;
  const visibleSections = useMemo(() => SECTION_DEFINITIONS, []);
  const finalSettingsSectionMeta = useMemo(
    () =>
      buildFinalSettingsMeta({
        formData,
        filledCompletionResults,
        filledCompletionOutputs,
        filledCompletionFinalNotes,
      }),
    [
      filledCompletionFinalNotes,
      filledCompletionOutputs,
      filledCompletionResults,
      formData,
    ]
  );
  const sectionMeta = useMemo<Record<string, string>>(
    () => ({
      basic: cleanStr(formData.titleAr) ? "تم تحديث هوية المشروع" : "ابدأ بعنوان المشروع ووصفه",
      details: cleanStr(formData.locationAr)
        ? `${projectTypeLabels[formData.projectType]} · ${statusLabels[formData.status]}`
        : "النوع والحالة والموقع",
      media: cleanStr(formData.coverImage)
        ? `${galleryUrls.length + 1} أصل بصري`
        : "أضف صورة الغلاف أولًا",
      highlights: filledHighlights ? `${filledHighlights} مميزات` : "لا توجد مميزات بعد",
      attachments: filledAttachments ? `${filledAttachments} مرفقات` : "لا توجد مرفقات بعد",
      milestones: filledMilestones ? `${filledMilestones} مراحل` : "لا توجد مراحل بعد",
      faq: filledFaq ? `${filledFaq} أسئلة` : "أضف الأسئلة الشائعة",
      finance: cleanStr(formData.targetAmount)
        ? `${cleanStr(formData.targetAmount)} ر.س`
        : "أضف الأرقام المالية",
      [FINAL_SETTINGS_SECTION_ID]: finalSettingsSectionMeta,
    }),
    [
      filledAttachments,
      filledCompletionFinalNotes,
      filledCompletionOutputs,
      filledCompletionResults,
      filledFaq,
      filledHighlights,
      filledMilestones,
      finalSettingsSectionMeta,
      formData.coverImage,
      formData.locationAr,
      formData.projectType,
      formData.status,
      formData.targetAmount,
      formData.titleAr,
      galleryUrls.length,
    ]
  );
  const sectionStatuses = useMemo(
    () =>
      buildSectionStatusMap({
        formData,
        highlightRows,
        attachmentRows,
        milestoneRows,
        faqRows,
        completionResultRows,
        completionOutputRows,
        completionFinalNoteRows,
        completionGalleryUrls,
      }),
    [
      attachmentRows,
      completionFinalNoteRows,
      completionGalleryUrls,
      completionOutputRows,
      completionResultRows,
      faqRows,
      formData,
      highlightRows,
      milestoneRows,
    ]
  );
  const requiredChecklist = useMemo(
    () => [
      { label: "العنوان العربي", ready: Boolean(cleanStr(formData.titleAr)) },
      { label: "الوصف العربي", ready: Boolean(cleanStr(formData.descriptionAr)) },
      { label: "الموقع العربي", ready: Boolean(cleanStr(formData.locationAr)) },
      { label: "صورة الغلاف", ready: Boolean(cleanStr(formData.coverImage)) },
    ],
    [formData.coverImage, formData.descriptionAr, formData.locationAr, formData.titleAr]
  );
  const currentSnapshot = useMemo(
    () =>
      serializeProjectEditorSnapshot({
        formData,
        highlightRows,
        attachmentRows,
        milestoneRows,
        faqRows,
        completionResultRows,
        completionOutputRows,
        completionFinalNoteRows,
      }),
    [
      attachmentRows,
      completionFinalNoteRows,
      completionOutputRows,
      completionResultRows,
      faqRows,
      formData,
      highlightRows,
      milestoneRows,
    ]
  );
  const isDirty = Boolean(savedSnapshot) && currentSnapshot !== savedSnapshot;
  const projectDisplayName =
    cleanStr(formData.titleAr) || cleanStr(formData.titleEn) || "مشروع بدون عنوان";

  const projectReference =
    cleanStr(projectBusinessId) || cleanStr(formData.issueNumber) || "سيُولّد عند الحفظ";

  useEffect(() => {
    const normalizedActiveSection = normalizeProjectBuilderSectionId(activeSection);
    if (normalizedActiveSection && normalizedActiveSection !== activeSection) {
      setActiveSection(normalizedActiveSection);
      return;
    }

    if (!visibleSections.some((section) => section.id === normalizedActiveSection)) {
      setActiveSection(visibleSections[0]?.id ?? "basic");
    }
  }, [activeSection, visibleSections]);

  const restoreSavedState = () => {
    if (!savedSnapshot) return;

    const snapshot = JSON.parse(savedSnapshot) as ProjectEditorSnapshot;
    setFormData(snapshot.formData);
    setHighlightRows(snapshot.highlightRows);
    setAttachmentRows(snapshot.attachmentRows);
    setMilestoneRows(snapshot.milestoneRows);
    setFaqRows(snapshot.faqRows);
    setCompletionResultRows(snapshot.completionResultRows);
    setCompletionOutputRows(snapshot.completionOutputRows);
    setCompletionFinalNoteRows(snapshot.completionFinalNoteRows);
    toast.success("تمت استعادة آخر نسخة محفوظة");
  };

  const handleAttachmentFileUpload = async (index: number, file?: File | null) => {
    if (!file || !projectId) return;

    try {
      setAttachmentRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, uploading: true } : row))
      );

      const uploaded = await uploadInvestmentDocument({
        entityType: "project",
        entityId: projectId,
        category: "project_attachment",
        projectId,
        file,
        kind: "attachment",
      });
      const downloadUrl = uploaded.fileUrl;
      if (!downloadUrl) throw new Error("Upload failed");

      setAttachmentRows((prev) =>
        prev.map((row, i) =>
          i === index
            ? {
                ...row,
                url: downloadUrl,
                name: row.name || file.name,
                uploading: false,
              }
            : row
        )
      );
      toast.success("تم رفع الملف بنجاح");
    } catch (e) {
      console.error(e);
      setAttachmentRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, uploading: false } : row))
      );
      toast.error("فشل رفع الملف");
    }
  };

  const handleCoverImageUpload = async (file?: File | null) => {
    if (!file || !projectId) return;

    try {
      setCoverUploading(true);
      const uploaded = await uploadInvestmentDocument({
        entityType: "project",
        entityId: projectId,
        category: "project_cover",
        projectId,
        file,
        kind: "attachment",
      });
      const downloadUrl = uploaded.fileUrl;
      if (!downloadUrl) throw new Error("Upload failed");
      setFormData((prev) => ({ ...prev, coverImage: downloadUrl }));
      toast.success("تم رفع صورة الغلاف بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("فشل رفع صورة الغلاف");
    } finally {
      setCoverUploading(false);
    }
  };

  const handleGalleryImageUpload = async (files?: FileList | null) => {
    if (!projectId) return;
    const selected = Array.from(files ?? []);
    if (!selected.length) return;

    try {
      setGalleryUploading(true);
      const uploadedUrls = await Promise.all(
        selected.map(async (file) => {
          const uploaded = await uploadInvestmentDocument({
            entityType: "project",
            entityId: projectId,
            category: "project_gallery",
            projectId,
            file,
            kind: "attachment",
          });
          const downloadUrl = uploaded.fileUrl;
          if (!downloadUrl) throw new Error("Upload failed");
          return downloadUrl;
        })
      );

      setFormData((prev) => {
        const current = prev.galleryText.trim();
        const appended = uploadedUrls.join("\n");
        return { ...prev, galleryText: current ? `${current}\n${appended}` : appended };
      });
      toast.success(
        selected.length === 1
          ? "تم رفع صورة المعرض بنجاح"
          : `تم رفع ${selected.length} صور للمعرض بنجاح`
      );
    } catch (e) {
      console.error(e);
      toast.error("فشل رفع صور المعرض");
    } finally {
      setGalleryUploading(false);
    }
  };

  const handleCompletionGalleryImageUpload = async (files?: FileList | null) => {
    if (!projectId) return;
    const selected = Array.from(files ?? []);
    if (!selected.length) return;

    try {
      setCompletionGalleryUploading(true);
      const uploadedUrls = await Promise.all(
        selected.map(async (file) => {
          const uploaded = await uploadInvestmentDocument({
            entityType: "project",
            entityId: projectId,
            category: "project_completion_gallery",
            projectId,
            file,
            kind: "attachment",
          });
          const downloadUrl = uploaded.fileUrl;
          if (!downloadUrl) throw new Error("Upload failed");
          return downloadUrl;
        })
      );

      setFormData((prev) => {
        const current = prev.completionGalleryText.trim();
        const appended = uploadedUrls.join("\n");
        return {
          ...prev,
          completionGalleryText: current ? `${current}\n${appended}` : appended,
        };
      });

      toast.success(
        selected.length === 1
          ? "تم رفع صورة نتائج المشروع بنجاح"
          : `تم رفع ${selected.length} صور لنتائج المشروع بنجاح`
      );
    } catch (e) {
      console.error(e);
      toast.error("فشل رفع صور نتائج المشروع");
    } finally {
      setCompletionGalleryUploading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
      setLoading(true);
      try {
        const ref = doc(db, "projects", projectId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setProjectExists(false);
          return;
        }

        const p = snap.data() as any;

        setMeta({
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        });

        const galleryArr: string[] = Array.isArray(p.gallery)
          ? p.gallery
          : Array.isArray(p.galleryImages)
          ? p.galleryImages
          : [];

        const highlightsArr: string[] = Array.isArray(p.highlights) ? p.highlights : [];

        const attachmentsArr: Attachment[] = Array.isArray(p.attachments) ? p.attachments : [];
        const milestonesArr: Milestone[] = Array.isArray(p.milestones) ? p.milestones : [];
        const faqArr: Faq[] = Array.isArray(p.faq) ? p.faq : [];
        const completionContent =
          p.completionContent && typeof p.completionContent === "object"
            ? p.completionContent
            : null;
        const completionResultsArr: string[] = Array.isArray(completionContent?.resultsAr)
          ? completionContent.resultsAr
          : [];
        const completionOutputsArr: CompletionOutput[] = Array.isArray(completionContent?.outputs)
          ? completionContent.outputs
          : [];
        const completionFinalNotesArr: string[] = Array.isArray(completionContent?.finalNotesAr)
          ? completionContent.finalNotesAr
          : [];
        const completionGalleryArr: string[] = Array.isArray(completionContent?.gallery)
          ? completionContent.gallery
          : [];
        const targetAmountValue = toNumOrZero(p.targetAmount);
        const coverageRateValue = toNumOrZero(p.coverageRate);
        const baseCoveredAmountValue =
          p.baseCoveredAmount != null
            ? toNumOrZero(p.baseCoveredAmount)
            : (targetAmountValue * coverageRateValue) / 100;
        const investmentsAmountValue =
          p.investmentsAmount != null
            ? toNumOrZero(p.investmentsAmount)
            : p.baseCoveredAmount != null
              ? Math.max(toNumOrZero(p.currentAmount) - baseCoveredAmountValue, 0)
              : toNumOrZero(p.currentAmount);
        const currentAmountValue = baseCoveredAmountValue + investmentsAmountValue;

        const nextFormData: FormDataState = {
          titleAr: cleanStr(p.titleAr),
          titleEn: cleanStr(p.titleEn ?? p.title ?? ""),

          descriptionAr: cleanStr(p.descriptionAr),
          descriptionEn: cleanStr(p.descriptionEn ?? p.description ?? ""),

          projectType: (p.projectType ?? "sukuk") as ProjectType,
          status: (p.status ?? "draft") as ProjectStatus,
          issueNumber: cleanStr(p.issueNumber),

          locationAr: cleanStr(p.locationAr),
          locationEn: cleanStr(p.locationEn ?? p.location ?? ""),

          coverImage: cleanStr(p.coverImage),
          galleryText: galleryArr.join("\n"),
          completionOverviewAr: cleanStr(completionContent?.overviewAr),
          completionSummaryAr: cleanStr(completionContent?.summaryAr),
          completionGalleryText: completionGalleryArr.join("\n"),

          targetAmount: p.targetAmount != null ? String(p.targetAmount) : "",
          currentAmount: String(currentAmountValue),
          coverageRate: p.coverageRate != null ? String(p.coverageRate) : "0",
          investmentsAmount: String(investmentsAmountValue),
          minInvestment: p.minInvestment != null ? String(p.minInvestment) : "",
          annualReturn: p.annualReturn != null ? String(p.annualReturn) : "",
          duration: p.duration != null ? String(p.duration) : "",
          investorsCount: p.investorsCount != null ? String(p.investorsCount) : "",

          featured: String(Boolean(p.featured)) as "true" | "false",
          isVip: String(Boolean(p.isVip)) as "true" | "false",
          vipTier: (p.vipTier ?? "none") as VipTier,

          progressMode: (p.progressMode ?? "hybrid") as ProgressMode,
          progressFundingWeight:
            p.progressFundingWeight != null ? String(p.progressFundingWeight) : "60",
          progressMilestonesWeight:
            p.progressMilestonesWeight != null ? String(p.progressMilestonesWeight) : "40",
        };
        setProjectBusinessId(cleanStr(p.businessId));
        const nextHighlightRows = highlightsArr.length ? highlightsArr : [""];
        const nextAttachmentRows = attachmentRowsFromItems(attachmentsArr);
        const nextMilestoneRows = milestoneRowsFromItems(milestonesArr);
        const nextFaqRows = faqRowsFromItems(faqArr);
        const nextCompletionResultRows = completionResultsArr.length ? completionResultsArr : [""];
        const nextCompletionOutputRows = completionOutputRowsFromItems(completionOutputsArr);
        const nextCompletionFinalNoteRows = completionFinalNotesArr.length
          ? completionFinalNotesArr
          : [""];

        setFormData(nextFormData);
        setHighlightRows(nextHighlightRows);
        setAttachmentRows(nextAttachmentRows);
        setMilestoneRows(nextMilestoneRows);
        setFaqRows(nextFaqRows);
        setCompletionResultRows(nextCompletionResultRows);
        setCompletionOutputRows(nextCompletionOutputRows);
        setCompletionFinalNoteRows(nextCompletionFinalNoteRows);
        setSavedSnapshot(
          serializeProjectEditorSnapshot({
            formData: nextFormData,
            highlightRows: nextHighlightRows,
            attachmentRows: nextAttachmentRows,
            milestoneRows: nextMilestoneRows,
            faqRows: nextFaqRows,
            completionResultRows: nextCompletionResultRows,
            completionOutputRows: nextCompletionOutputRows,
            completionFinalNoteRows: nextCompletionFinalNoteRows,
          })
        );
      } catch (err) {
        console.error(err);
        toast.error("فشل تحميل المشروع");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    if (coverUploading || galleryUploading) {
      toast.warning("انتظر حتى يكتمل رفع الصور.");
      return;
    }
    if (attachmentRows.some((row) => row.uploading)) {
      toast.warning("انتظر حتى يكتمل رفع المرفقات.");
      return;
    }

    if (completionGalleryUploading) {
      toast.warning("انتظر حتى يكتمل رفع الصور.");
      return;
    }

    const highlightsArr = highlightRows.map((x) => cleanStr(x)).filter(Boolean);

    const parsedAttachments = parseAttachmentRows(attachmentRows);
    if (parsedAttachments.errors.length) {
      toast.error(`المرفقات: ${parsedAttachments.errors[0]}`);
      return;
    }

    const parsedMilestones = parseMilestoneRows(milestoneRows);
    if (parsedMilestones.errors.length) {
      toast.error(`المراحل: ${parsedMilestones.errors[0]}`);
      return;
    }

    const parsedFaq = parseFaqRows(faqRows);
    if (parsedFaq.errors.length) {
      toast.error(`الأسئلة الشائعة: ${parsedFaq.errors[0]}`);
      return;
    }

    const completionContentResult = buildCompletionContentPayload({
      overviewAr: formData.completionOverviewAr,
      summaryAr: formData.completionSummaryAr,
      resultsAr: completionResultRows,
      outputRows: completionOutputRows,
      finalNotesAr: completionFinalNoteRows,
      gallery: completionGalleryUrls,
    });
    if (completionContentResult.errors.length) {
      toast.error(`المحتوى الختامي: ${completionContentResult.errors[0]}`);
      return;
    }
    const completionContent = completionContentResult.value;

    try {
      setSaving(true);
      const projectRef = doc(db, "projects", projectId);
      const coverageAmounts = buildCoverageAmounts({
        targetAmount: formData.targetAmount,
        coverageRate: formData.coverageRate,
        investmentsAmount: formData.investmentsAmount,
        minInvestment: formData.minInvestment,
      });

      const payload: any = {
        // titles/descriptions
        titleAr: cleanStr(formData.titleAr),
        titleEn: cleanStr(formData.titleEn),
        descriptionAr: cleanStr(formData.descriptionAr),
        descriptionEn: cleanStr(formData.descriptionEn),

        projectType: formData.projectType,
        status: formData.status,
        issueNumber: cleanStr(formData.issueNumber),

        locationAr: cleanStr(formData.locationAr),
        locationEn: cleanStr(formData.locationEn),

        coverImage: cleanStr(formData.coverImage),
        gallery: galleryUrls,

        targetAmount: toNumOrZero(formData.targetAmount),
        coverageRate: toNumOrZero(formData.coverageRate),
        baseCoveredAmount: coverageAmounts.baseCoveredAmount,
        investmentsAmount: coverageAmounts.investmentsAmount,
        currentAmount: coverageAmounts.currentAmount,
        minInvestment: toNumOrZero(formData.minInvestment),
        annualReturn: toNumOrZero(formData.annualReturn),
        duration: toNumOrZero(formData.duration),
        remainingInvestorsCount: coverageAmounts.remainingInvestorsCount,

        featured: formData.featured === "true",
        isVip: formData.isVip === "true",
        vipTier: formData.vipTier,

        highlights: highlightsArr,
        attachments: parsedAttachments.items,
        milestones: parsedMilestones.items,
        faq: parsedFaq.items,
        completionContent,

        progressMode: formData.progressMode,
        progressFundingWeight: toNumOrZero(formData.progressFundingWeight),
        progressMilestonesWeight: toNumOrZero(formData.progressMilestonesWeight),
        updatedAt: serverTimestamp(),
      };

      const nextBusinessId = await runAuditedOperation<string>({
        action: AUDIT_ACTIONS.PROJECT_UPDATED,
        category: "project",
        entityType: "project",
        source: buildAuditSource({
          area: "admin",
          page: "EditProject",
          method: "update",
        }),
        relatedIds: { projectId },
        message: ({ result }) => `Updated project ${result}`,
        meta: ({ result }) => ({
          businessId: result,
          projectName: cleanStr(formData.titleAr) || cleanStr(formData.titleEn) || result,
          status: formData.status,
          projectType: formData.projectType,
        }),
        targets: [{ ref: projectRef, entityType: "project" }],
        ignoreFields: ["updatedAt"],
        execute: async () =>
          runTransaction(db, async (tx) => {
            const projectSnap = await tx.get(projectRef);
            if (!projectSnap.exists()) throw new Error("project_not_found");

            const resolvedBusinessId =
              cleanStr(projectSnap.data()?.businessId) ||
              cleanStr(projectBusinessId) ||
              (await reserveNextBusinessId(tx, "projects"));

            tx.set(
              projectRef,
              {
                ...payload,
                businessId: resolvedBusinessId,
              },
              { merge: true }
            );

            return resolvedBusinessId;
          }),
      });

      const nextUpdatedAt = new Date();
      setMeta((prev) => ({ ...prev, updatedAt: nextUpdatedAt }));
      setProjectBusinessId(nextBusinessId);
      setSavedSnapshot(currentSnapshot);
      toast.success("تم حفظ التغييرات بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("فشل حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  };

  /* =========================
     States
  ========================= */
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">جاري التحميل...</div>
      </DashboardLayout>
    );
  }

  if (!projectExists) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-lg">المشروع غير موجود</p>
          <Button onClick={() => setLocation("/admin/projects")}>
            <ArrowRight className="w-4 h-4 ml-2" />
            العودة
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const formId = "edit-project-workspace-form";
  const saveStateLabel = isDirty ? "تغييرات غير محفوظة" : "جميع التغييرات محفوظة";
  const previewPath = `/projects/${projectId}`;
  const canRestore = isDirty && !isBusy;
  const headerMetrics: SummaryMetric[] = [
    {
      icon: CheckCircle2,
      label: "حالة المشروع",
      value: statusLabels[formData.status],
    },
    {
      icon: FolderKanban,
      label: "تصنيف المشروع",
      value: projectTypeLabels[formData.projectType],
    },
    {
      icon: FileImage,
      label: "الأصول والوسائط",
      value: `${totalAssets} عنصر`,
    },
    {
      icon: BarChart3,
      label: "حالة الحفظ",
      value: saveStateLabel,
    },
  ];
  const sidebarMetrics: SummaryMetric[] = [
    {
      icon: FolderKanban,
      label: "معرّف المشروع",
      value: projectReference,
    },
    {
      icon: Clock3,
      label: "آخر تحديث",
      value: safeDateLabel(meta.updatedAt),
    },
    {
      icon: FileImage,
      label: "نمط العرض",
      value:
        formData.isVip === "true" || formData.projectType === "vip_exclusive"
          ? `VIP · ${vipTierLabels[formData.vipTier]}`
          : formData.featured === "true"
            ? "مشروع مميز"
            : "عرض قياسي",
    },
  ];
  const headerContext = (
    <>
      <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white">
        {statusLabels[formData.status]}
      </Badge>
      <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white">
        {projectTypeLabels[formData.projectType]}
      </Badge>
      {projectReference !== "سيُولّد عند الحفظ" ? (
        <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white">
          {projectReference}
        </Badge>
      ) : null}
      <Badge
        className={`rounded-full border px-3 py-1 ${
          isDirty
            ? "border-amber-300/50 bg-amber-400/15 text-amber-50"
            : "border-emerald-300/45 bg-emerald-400/15 text-emerald-50"
        }`}
      >
        {saveStateLabel}
      </Badge>
    </>
  );
  const headerTitle = (
    <>
      <span className="block text-xs font-semibold uppercase tracking-[0.28em] text-slate-300">
        تعديل المشروع
      </span>
      <span className="mt-3 block">{projectDisplayName}</span>
    </>
  );
  const headerDescription = (
    <>
      هذه مساحة إدارة موحدة لتحديث بيانات المشروع وتنظيم المحتوى وضبط حالة النشر أو الإغلاق من نفس الواجهة بدون فقدان السياق.
      <span className="mt-2 block text-slate-300/90">
        آخر تحديث: {safeDateLabel(meta.updatedAt)} · إنشاء: {safeDateLabel(meta.createdAt)}
      </span>
    </>
  );
  const footerDescription: ReactNode = saving
    ? "جارٍ حفظ آخر التعديلات على المشروع الآن."
    : hasUploadingAttachment
      ? "يوجد مرفق قيد الرفع الآن. انتظر حتى يكتمل قبل تنفيذ الحفظ النهائي."
      : coverUploading || galleryUploading || completionGalleryUploading
        ? "يوجد رفع وسائط جارٍ الآن. ستبقى الأزرار معطلة حتى يكتمل."
        : isDirty
          ? "هناك تعديلات غير محفوظة. يمكنك حفظها الآن أو استعادة آخر نسخة محفوظة."
          : "كل التعديلات الحالية محفوظة، ويمكنك متابعة المراجعة أو الانتقال للمعاينة.";
  const headerActions = (
    <div className="flex w-full flex-col gap-3 lg:items-end">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12 hover:text-white"
          onClick={() => setLocation("/admin/projects")}
        >
          <ArrowRight className="ml-2 h-4 w-4" />
          العودة
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12 hover:text-white"
          onClick={() => setLocation(previewPath)}
        >
          <Eye className="ml-2 h-4 w-4" />
          معاينة المشروع
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12 hover:text-white disabled:border-white/10 disabled:text-white/45"
          disabled={!canRestore}
          onClick={restoreSavedState}
        >
          <RotateCcw className="ml-2 h-4 w-4" />
          إلغاء التعديلات
        </Button>
        <Button
          type="submit"
          form={formId}
          className="h-11 rounded-2xl bg-white px-5 text-slate-950 shadow-[0_20px_35px_-22px_rgba(255,255,255,0.7)] hover:bg-slate-100 disabled:bg-white/80"
          disabled={isBusy || !isDirty}
        >
          <Save className="ml-2 h-4 w-4" />
          {saving ? "جارٍ حفظ التغييرات..." : "حفظ التغييرات"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-right shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            رقم المشروع
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {projectReference}
          </p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-right shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            آخر مزامنة
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{safeDateLabel(meta.updatedAt)}</p>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <CreateProjectUi
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        attachmentRows={attachmentRows}
        completionFinalNoteRows={completionFinalNoteRows}
        completionGalleryUploading={completionGalleryUploading}
        completionGalleryUrls={completionGalleryUrls}
        completionOutputRows={completionOutputRows}
        completionResultRows={completionResultRows}
        coverUploading={coverUploading}
        draftProjectId={projectId ?? ""}
        faqRows={faqRows}
        filledCompletionFinalNotes={filledCompletionFinalNotes}
        filledCompletionOutputs={filledCompletionOutputs}
        filledCompletionResults={filledCompletionResults}
        filledAttachments={filledAttachments}
        filledFaq={filledFaq}
        filledHighlights={filledHighlights}
        filledMilestones={filledMilestones}
        formData={formData}
        formId={formId}
        footerDescription={footerDescription}
        footerTitle="إجراءات الحفظ"
        galleryUploading={galleryUploading}
        galleryUrls={galleryUrls}
        handleAttachmentFileUpload={handleAttachmentFileUpload}
        handleCompletionGalleryImageUpload={handleCompletionGalleryImageUpload}
        handleCoverImageUpload={handleCoverImageUpload}
        handleGalleryImageUpload={handleGalleryImageUpload}
        handleSubmit={handleSubmit}
        hasUploadingAttachment={hasUploadingAttachment}
        headerActions={headerActions}
        headerBadgeText="تعديل المشروع"
        headerContext={headerContext}
        headerDescription={headerDescription}
        headerMetrics={headerMetrics}
        headerTitle={headerTitle}
        highlightRows={highlightRows}
        isBusy={isBusy}
        isDirty={isDirty}
        milestoneRows={milestoneRows}
        primaryActionLabel="حفظ التغييرات"
        primaryActionLoadingLabel="جارٍ حفظ التغييرات..."
        progressWeightsTotal={progressWeightsTotal}
        requiredChecklist={requiredChecklist}
        requiredReady={requiredReady}
        sectionMeta={sectionMeta}
        sectionStatuses={sectionStatuses}
        setAttachmentRows={setAttachmentRows}
        setCompletionFinalNoteRows={setCompletionFinalNoteRows}
        setCompletionOutputRows={setCompletionOutputRows}
        setCompletionResultRows={setCompletionResultRows}
        setFaqRows={setFaqRows}
        setFormData={setFormData}
        setHighlightRows={setHighlightRows}
        setLocation={setLocation}
        setMilestoneRows={setMilestoneRows}
        sidebarChecklistDescription="العناصر التالية تساعد الفريق على حفظ المشروع دون أخطاء أو نقص في المعلومات."
        sidebarChecklistTitle="جاهزية الحفظ"
        sidebarDescription="انتقل بين أقسام المشروع مع ملخص حيّ لحالة التعديل والمحتوى والوسائط قبل النشر أو الإغلاق."
        sidebarMetrics={sidebarMetrics}
        sidebarTitle="لوحة إدارة المشروع"
        saving={saving}
        totalAssets={totalAssets}
        workspaceIdLabel="معرّف المشروع"
        workspaceIdValue={projectReference}
      />
    </DashboardLayout>
  );
}

