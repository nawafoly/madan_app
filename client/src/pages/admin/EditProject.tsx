// client/src/pages/admin/EditProject.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRoute, useLocation } from "wouter";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/_core/firebase";
import { AUDIT_ACTIONS, auditedUpdateDoc, buildAuditSource } from "@/lib/auditLog";
import { uploadInvestmentDocument } from "@/lib/documentUploadService";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  buildFinalSettingsMeta,
  buildSectionStatusMap,
  buildCompletionContentPayload,
  normalizeProjectBuilderSectionId,
  projectTypeLabels,
  statusLabels,
  vipTierLabels,
  type FormDataState,
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
    if (!v) return "â€”";
    if (typeof v?.toDate === "function") return formatDateTimeEN(v.toDate());
    if (v instanceof Date) return formatDateTimeEN(v);
    if (typeof v === "string" || typeof v === "number")
      return formatDateTimeEN(new Date(v));
    return "â€”";
  } catch {
    return "â€”";
  }
}

// âœ… helper: ظٹط¬ط¹ظ„ طµظˆط± public طھط´طھط؛ظ„ ظ„ظˆ ظƒطھط¨طھ ط§ط³ظ… ط§ظ„ظ…ظ„ظپ ظپظ‚ط·
function normalizeCover(src?: string) {
  const s = (src ?? "").toString().trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return s;
  return `/${s}`;
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
type EditorSnapshot = {
  formData: FormDataState;
  highlightRows: string[];
  attachmentRows: AttachmentRow[];
  milestoneRows: MilestoneRow[];
  faqRows: FaqRow[];
  completionResultRows: string[];
  completionOutputRows: CompletionOutputRow[];
  completionFinalNoteRows: string[];
};

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
      errors.push(`ط§ظ„ظ…ط±ظپظ‚ ${idx + 1}: ط£ط¶ظپ ظ…ظ„ظپظ‹ط§ ط£ظˆ ط±ط§ط¨ط·ظ‹ط§ ط®ط§ط±ط¬ظٹظ‹ط§ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„.`);
      return;
    }
    items.push({
      name: name || `ظ…ط±ظپظ‚ ${idx + 1}`,
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
      errors.push(`ط§ظ„ظ…ط±ط­ظ„ط© ${idx + 1}: ط§ظ„ط¹ظ†ظˆط§ظ† ظ…ط·ظ„ظˆط¨.`);
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
      errors.push(`ط³ط¤ط§ظ„ FAQ ط±ظ‚ظ… ${idx + 1}: ط§ظ„ط³ط¤ط§ظ„ ظ…ط·ظ„ظˆط¨.`);
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
      errors.push(`ظ…ط®ط±ط¬ ط§ظ„ظ…ط´ط±ظˆط¹ ${idx + 1}: ط§ظ„ط¹ظ†ظˆط§ظ† ظ…ط·ظ„ظˆط¨.`);
      return;
    }
    if (!descriptionAr) {
      errors.push(`ظ…ط®ط±ط¬ ط§ظ„ظ…ط´ط±ظˆط¹ ${idx + 1}: ط§ظ„ظˆطµظپ ظ…ط·ظ„ظˆط¨.`);
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

function isCompletionStatus(status: ProjectStatus) {
  return status === "closed" || status === "completed";
}

function serializeEditorSnapshot(snapshot: EditorSnapshot) {
  return JSON.stringify(snapshot);
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

  const [meta, setMeta] = useState<{ createdAt?: any; updatedAt?: any }>({});

  // âœ… Inputs ظƒظ†طµظˆطµ ط¹ط´ط§ظ† ظ…ط§ طھطھظƒط³ط± ظ…ط¹ ط§ظ„ظƒطھط§ط¨ط©
  const [formData, setFormData] = useState<FormDataState>({
    // titles
    titleAr: "",
    titleEn: "",

    // descriptions
    descriptionAr: "",
    descriptionEn: "",

    // meta
    projectType: "sukuk" as ProjectType,
    status: "draft" as ProjectStatus,
    issueNumber: "",

    locationAr: "",
    locationEn: "",

    // media
    coverImage: "",
    galleryText: "", // ط±ظˆط§ط¨ط· ظƒظ„ ط³ط·ط± (ظ†ط­ظپط¸ظ‡ط§ ظپظٹ gallery)
    completionOverviewAr: "",
    completionSummaryAr: "",
    completionGalleryText: "",

    // finance (text inputs)
    targetAmount: "",
    currentAmount: "",
    minInvestment: "",
    annualReturn: "",
    duration: "",
    investorsCount: "",

    // optional flags
    featured: "false" as "true" | "false",
    isVip: "false" as "true" | "false",
    vipTier: "none" as VipTier,

    // âœ… NEW (progress control)
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
      basic: cleanStr(formData.titleAr) ? "طھظ… طھط­ط¯ظٹط« ظ‡ظˆظٹط© ط§ظ„ظ…ط´ط±ظˆط¹" : "ط§ط¨ط¯ط£ ط¨ط¹ظ†ظˆط§ظ† ط§ظ„ظ…ط´ط±ظˆط¹ ظˆظˆطµظپظ‡",
      details: cleanStr(formData.locationAr)
        ? `${projectTypeLabels[formData.projectType]} آ· ${statusLabels[formData.status]}`
        : "ط§ظ„ظ†ظˆط¹ ظˆط§ظ„ط­ط§ظ„ط© ظˆط§ظ„ظ…ظˆظ‚ط¹",
      media: cleanStr(formData.coverImage)
        ? `${galleryUrls.length + 1} ط£طµظ„ ط¨طµط±ظٹ`
        : "ط£ط¶ظپ طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ ط£ظˆظ„ظ‹ط§",
      highlights: filledHighlights ? `${filledHighlights} ظ…ظ…ظٹط²ط§طھ` : "ظ„ط§ طھظˆط¬ط¯ ظ…ظ…ظٹط²ط§طھ ط¨ط¹ط¯",
      attachments: filledAttachments ? `${filledAttachments} ظ…ط±ظپظ‚ط§طھ` : "ظ„ط§ طھظˆط¬ط¯ ظ…ط±ظپظ‚ط§طھ ط¨ط¹ط¯",
      milestones: filledMilestones ? `${filledMilestones} ظ…ط±ط§ط­ظ„` : "ظ„ط§ طھظˆط¬ط¯ ظ…ط±ط§ط­ظ„ ط¨ط¹ط¯",
      faq: filledFaq ? `${filledFaq} ط£ط³ط¦ظ„ط©` : "ط£ط¶ظپ ط§ظ„ط£ط³ط¦ظ„ط© ط§ظ„ط´ط§ط¦ط¹ط©",
      finance: cleanStr(formData.targetAmount)
        ? `${cleanStr(formData.targetAmount)} ط±.ط³`
        : "ط£ط¶ظپ ط§ظ„ط£ط±ظ‚ط§ظ… ط§ظ„ظ…ط§ظ„ظٹط©",
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
      { label: "ط§ظ„ط¹ظ†ظˆط§ظ† ط§ظ„ط¹ط±ط¨ظٹ", ready: Boolean(cleanStr(formData.titleAr)) },
      { label: "ط§ظ„ظˆطµظپ ط§ظ„ط¹ط±ط¨ظٹ", ready: Boolean(cleanStr(formData.descriptionAr)) },
      { label: "ط§ظ„ظ…ظˆظ‚ط¹ ط§ظ„ط¹ط±ط¨ظٹ", ready: Boolean(cleanStr(formData.locationAr)) },
      { label: "طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ", ready: Boolean(cleanStr(formData.coverImage)) },
    ],
    [formData.coverImage, formData.descriptionAr, formData.locationAr, formData.titleAr]
  );
  const currentSnapshot = useMemo(
    () =>
      serializeEditorSnapshot({
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
    cleanStr(formData.titleAr) || cleanStr(formData.titleEn) || "ظ…ط´ط±ظˆط¹ ط¨ط¯ظˆظ† ط¹ظ†ظˆط§ظ†";

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

  useEffect(() => {
    const sectionElements = visibleSections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!sectionElements.length) return;

    let frameId = 0;

    const updateActiveSectionFromScroll = () => {
      frameId = 0;

      const navElement = document.querySelector<HTMLElement>("[data-project-section-nav]");
      const probeY = navElement
        ? navElement.getBoundingClientRect().bottom + 24
        : Math.min(window.innerHeight * 0.24, 220);

      let nextActiveSection = sectionElements[0]?.id ?? visibleSections[0]?.id ?? "basic";

      for (const section of sectionElements) {
        if (section.getBoundingClientRect().top <= probeY) {
          nextActiveSection = section.id;
          continue;
        }
        break;
      }

      setActiveSection((prev) => (prev === nextActiveSection ? prev : nextActiveSection));
    };

    const scheduleActiveSectionUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateActiveSectionFromScroll);
    };

    const navElement = document.querySelector<HTMLElement>("[data-project-section-nav]");
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleActiveSectionUpdate();
          })
        : null;

    window.addEventListener("scroll", scheduleActiveSectionUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveSectionUpdate);

    resizeObserver?.observe(document.body);
    navElement ? resizeObserver?.observe(navElement) : null;
    sectionElements.forEach((element) => resizeObserver?.observe(element));

    scheduleActiveSectionUpdate();

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", scheduleActiveSectionUpdate);
      window.removeEventListener("resize", scheduleActiveSectionUpdate);
      resizeObserver?.disconnect();
    };
  }, [visibleSections]);

  const restoreSavedState = () => {
    if (!savedSnapshot) return;

    const snapshot = JSON.parse(savedSnapshot) as EditorSnapshot;
    setFormData(snapshot.formData);
    setHighlightRows(snapshot.highlightRows);
    setAttachmentRows(snapshot.attachmentRows);
    setMilestoneRows(snapshot.milestoneRows);
    setFaqRows(snapshot.faqRows);
    setCompletionResultRows(snapshot.completionResultRows);
    setCompletionOutputRows(snapshot.completionOutputRows);
    setCompletionFinalNoteRows(snapshot.completionFinalNoteRows);
    toast.success("طھظ…طھ ط§ط³طھط¹ط§ط¯ط© ط¢ط®ط± ظ†ط³ط®ط© ظ…ط­ظپظˆط¸ط©");
  };
  // ARCHITECTURE NOTE (2026-03-12):
  // The Worker response is the source of truth for uploaded file URLs.
  // Do not rebuild download URLs locally when the Worker already returns fileUrl.

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
      toast.success("طھظ… ط±ظپط¹ ط§ظ„ظ…ظ„ظپ ط¨ظ†ط¬ط§ط­");
    } catch (e) {
      console.error(e);
      setAttachmentRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, uploading: false } : row))
      );
      toast.error("ظپط´ظ„ ط±ظپط¹ ط§ظ„ظ…ظ„ظپ");
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
      toast.success("طھظ… ط±ظپط¹ طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ ط¨ظ†ط¬ط§ط­");
    } catch (e) {
      console.error(e);
      toast.error("ظپط´ظ„ ط±ظپط¹ طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ");
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
          ? "طھظ… ط±ظپط¹ طµظˆط±ط© ط§ظ„ظ…ط¹ط±ط¶ ط¨ظ†ط¬ط§ط­"
          : `طھظ… ط±ظپط¹ ${selected.length} طµظˆط± ظ„ظ„ظ…ط¹ط±ط¶ ط¨ظ†ط¬ط§ط­`
      );
    } catch (e) {
      console.error(e);
      toast.error("ظپط´ظ„ ط±ظپط¹ طµظˆط± ط§ظ„ظ…ط¹ط±ط¶");
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
          ? "طھظ… ط±ظپط¹ طµظˆط±ط© ظ†طھط§ط¦ط¬ ط§ظ„ظ…ط´ط±ظˆط¹ ط¨ظ†ط¬ط§ط­"
          : `طھظ… ط±ظپط¹ ${selected.length} طµظˆط± ظ„ظ†طھط§ط¦ط¬ ط§ظ„ظ…ط´ط±ظˆط¹ ط¨ظ†ط¬ط§ط­`
      );
    } catch (e) {
      console.error(e);
      toast.error("ظپط´ظ„ ط±ظپط¹ طµظˆط± ظ†طھط§ط¦ط¬ ط§ظ„ظ…ط´ط±ظˆط¹");
    } finally {
      setCompletionGalleryUploading(false);
    }
  };

  /* =========================
     Load project from Firestore
  ========================= */
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

        // âœ… طھظˆط§ظپظ‚ ظ…ط¹ ط§ظ„ظ‚ط¯ظٹظ… + ط§ظ„ط¬ط¯ظٹط¯:
        // - ط§ظ„ط¬ط¯ظٹط¯: gallery
        // - ط§ظ„ظ‚ط¯ظٹظ…: galleryImages
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
          currentAmount: p.currentAmount != null ? String(p.currentAmount) : "",
          minInvestment: p.minInvestment != null ? String(p.minInvestment) : "",
          annualReturn: p.annualReturn != null ? String(p.annualReturn) : "",
          duration: p.duration != null ? String(p.duration) : "",
          investorsCount: p.investorsCount != null ? String(p.investorsCount) : "",

          featured: String(Boolean(p.featured)) as "true" | "false",
          isVip: String(Boolean(p.isVip)) as "true" | "false",
          vipTier: (p.vipTier ?? "none") as VipTier,

          // âœ… progress control
          progressMode: (p.progressMode ?? "hybrid") as ProgressMode,
          progressFundingWeight:
            p.progressFundingWeight != null ? String(p.progressFundingWeight) : "60",
          progressMilestonesWeight:
            p.progressMilestonesWeight != null ? String(p.progressMilestonesWeight) : "40",
        };
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
          serializeEditorSnapshot({
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
        toast.error("ظپط´ظ„ طھط­ظ…ظٹظ„ ط§ظ„ظ…ط´ط±ظˆط¹");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId]);

  /* =========================
     Submit update
  ========================= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    if (coverUploading || galleryUploading) {
      toast.warning("ط§ظ†طھط¸ط± ط­طھظ‰ ظٹظƒطھظ…ظ„ ط±ظپط¹ ط§ظ„طµظˆط±.");
      return;
    }
    if (attachmentRows.some((row) => row.uploading)) {
      toast.warning("ط§ظ†طھط¸ط± ط­طھظ‰ ظٹظƒطھظ…ظ„ ط±ظپط¹ ط§ظ„ظ…ط±ظپظ‚ط§طھ.");
      return;
    }

    if (completionGalleryUploading) {
      toast.warning("ط§ظ†طھط¸ط± ط­طھظ‰ ظٹظƒطھظ…ظ„ ط±ظپط¹ ط§ظ„طµظˆط±.");
      return;
    }

    const highlightsArr = highlightRows.map((x) => cleanStr(x)).filter(Boolean);

    const parsedAttachments = parseAttachmentRows(attachmentRows);
    if (parsedAttachments.errors.length) {
      toast.error(`ط§ظ„ظ…ط±ظپظ‚ط§طھ: ${parsedAttachments.errors[0]}`);
      return;
    }

    const parsedMilestones = parseMilestoneRows(milestoneRows);
    if (parsedMilestones.errors.length) {
      toast.error(`ط§ظ„ظ…ط±ط§ط­ظ„: ${parsedMilestones.errors[0]}`);
      return;
    }

    const parsedFaq = parseFaqRows(faqRows);
    if (parsedFaq.errors.length) {
      toast.error(`ط§ظ„ط£ط³ط¦ظ„ط© ط§ظ„ط´ط§ط¦ط¹ط©: ${parsedFaq.errors[0]}`);
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
      toast.error(`ط§ظ„ظ…ط­طھظˆظ‰ ط§ظ„ط®طھط§ظ…ظٹ: ${completionContentResult.errors[0]}`);
      return;
    }
    const completionContent = completionContentResult.value;

    try {
      setSaving(true);

      const payload: any = {
        // titles/descriptions
        titleAr: cleanStr(formData.titleAr),
        titleEn: cleanStr(formData.titleEn),
        descriptionAr: cleanStr(formData.descriptionAr),
        descriptionEn: cleanStr(formData.descriptionEn),

        // meta
        projectType: formData.projectType,
        status: formData.status,
        issueNumber: cleanStr(formData.issueNumber),

        locationAr: cleanStr(formData.locationAr),
        locationEn: cleanStr(formData.locationEn),

        // media
        // LEGACY READ MODEL NOTE (2026-03-12):
        // These URLs are still mirrored into Firestore so the existing project
        // reader pages keep working during phase 1. The upload source of truth
        // is still Cloudflare Worker -> R2 -> D1.
        coverImage: cleanStr(formData.coverImage),
        // âœ… IMPORTANT: ظ†ط­ظپط¸ظ‡ط§ ط¨ط§ط³ظ… gallery (ط§ظ„ظ„ظٹ ProjectDetails ظٹظ‚ط±ط£ظ‡)
        gallery: galleryUrls,

        // finance (numbers)
        targetAmount: toNumOrZero(formData.targetAmount),
        minInvestment: toNumOrZero(formData.minInvestment),
        annualReturn: toNumOrZero(formData.annualReturn),
        duration: toNumOrZero(formData.duration),

        // flags
        featured: formData.featured === "true",
        isVip: formData.isVip === "true",
        vipTier: formData.vipTier,

        // âœ… NEW (for ProjectDetails)
        highlights: highlightsArr,
        attachments: parsedAttachments.items,
        milestones: parsedMilestones.items,
        faq: parsedFaq.items,
        completionContent,

        // âœ… progress control (NEW)
        progressMode: formData.progressMode,
        progressFundingWeight: toNumOrZero(formData.progressFundingWeight),
        progressMilestonesWeight: toNumOrZero(formData.progressMilestonesWeight),

      };

      await auditedUpdateDoc({
        ref: doc(db, "projects", projectId),
        data: payload,
        action: AUDIT_ACTIONS.PROJECT_UPDATED,
        category: "project",
        entityType: "project",
        source: buildAuditSource({
          area: "admin",
          page: "EditProject",
          method: "update",
        }),
        relatedIds: { projectId },
        message: `Updated project ${cleanStr(formData.titleAr) || cleanStr(formData.titleEn) || projectId}`,
        meta: {
          projectName: cleanStr(formData.titleAr) || cleanStr(formData.titleEn) || projectId,
          status: formData.status,
          projectType: formData.projectType,
        },
        ignoreFields: ["updatedAt"],
      });

      const nextUpdatedAt = new Date();
      setMeta((prev) => ({ ...prev, updatedAt: nextUpdatedAt }));
      setSavedSnapshot(currentSnapshot);
      toast.success("طھظ… ط­ظپط¸ ط§ظ„طھط؛ظٹظٹط±ط§طھ ط¨ظ†ط¬ط§ط­");
    } catch (err) {
      console.error(err);
      toast.error("ظپط´ظ„ ط­ظپط¸ ط§ظ„طھط¹ط¯ظٹظ„ط§طھ");
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
        <div className="flex items-center justify-center h-64">ط¬ط§ط±ظٹ ط§ظ„طھط­ظ…ظٹظ„...</div>
      </DashboardLayout>
    );
  }

  if (!projectExists) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-lg">ط§ظ„ظ…ط´ط±ظˆط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯</p>
          <Button onClick={() => setLocation("/admin/projects")}>
            <ArrowRight className="w-4 h-4 ml-2" />
            ط§ظ„ط¹ظˆط¯ط©
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const formId = "edit-project-workspace-form";
  const saveStateLabel = isDirty ? "طھط؛ظٹظٹط±ط§طھ ط؛ظٹط± ظ…ط­ظپظˆط¸ط©" : "ط¬ظ…ظٹط¹ ط§ظ„طھط؛ظٹظٹط±ط§طھ ظ…ط­ظپظˆط¸ط©";
  const previewPath = `/projects/${projectId}`;
  const canRestore = isDirty && !isBusy;
  const headerMetrics: SummaryMetric[] = [
    {
      icon: CheckCircle2,
      label: "ط­ط§ظ„ط© ط§ظ„ظ…ط´ط±ظˆط¹",
      value: statusLabels[formData.status],
    },
    {
      icon: FolderKanban,
      label: "طھطµظ†ظٹظپ ط§ظ„ظ…ط´ط±ظˆط¹",
      value: projectTypeLabels[formData.projectType],
    },
    {
      icon: FileImage,
      label: "ط§ظ„ط£طµظˆظ„ ظˆط§ظ„ظˆط³ط§ط¦ط·",
      value: `${totalAssets} ط¹ظ†طµط±`,
    },
    {
      icon: BarChart3,
      label: "ط­ط§ظ„ط© ط§ظ„ط­ظپط¸",
      value: saveStateLabel,
    },
  ];
  const sidebarMetrics: SummaryMetric[] = [
    {
      icon: FolderKanban,
      label: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ…ط´ط±ظˆط¹",
      value: projectId?.slice(0, 8) ?? "â€”",
    },
    {
      icon: Clock3,
      label: "ط¢ط®ط± طھط­ط¯ظٹط«",
      value: safeDateLabel(meta.updatedAt),
    },
    {
      icon: FileImage,
      label: "ظ†ظ…ط· ط§ظ„ط¹ط±ط¶",
      value:
        formData.isVip === "true" || formData.projectType === "vip_exclusive"
          ? `VIP آ· ${vipTierLabels[formData.vipTier]}`
          : formData.featured === "true"
            ? "ظ…ط´ط±ظˆط¹ ظ…ظ…ظٹط²"
            : "ط¹ط±ط¶ ظ‚ظٹط§ط³ظٹ",
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
      {cleanStr(formData.issueNumber) ? (
        <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white">
          {cleanStr(formData.issueNumber)}
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
        طھط¹ط¯ظٹظ„ ط§ظ„ظ…ط´ط±ظˆط¹
      </span>
      <span className="mt-3 block">{projectDisplayName}</span>
    </>
  );
  const headerDescription = (
    <>
      ظ…ط³ط§ط­ط© ط¥ط¯ط§ط±ط© ظ…ظˆط­ط¯ط© ظ„طھط­ط¯ظٹط« ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط´ط±ظˆط¹طŒ طھظ†ط¸ظٹظ… ظ…ط­طھظˆط§ظ‡طŒ ظˆط¶ط¨ط· ط­ط§ظ„ط© ط§ظ„ظ†ط´ط± ط£ظˆ ط§ظ„ط¥ط؛ظ„ط§ظ‚ ظ…ظ†
      ظ†ظپط³ ط§ظ„ظˆط§ط¬ظ‡ط© ط¨ط¯ظˆظ† ظپظ‚ط¯ط§ظ† ط§ظ„ط³ظٹط§ظ‚.
      <span className="mt-2 block text-slate-300/90">
        ط¢ط®ط± طھط­ط¯ظٹط«: {safeDateLabel(meta.updatedAt)} آ· ط¥ظ†ط´ط§ط،: {safeDateLabel(meta.createdAt)}
      </span>
    </>
  );
  const footerDescription: ReactNode = saving
    ? "ط¬ط§ط±ظچ ط­ظپط¸ ط¢ط®ط± ط§ظ„طھط¹ط¯ظٹظ„ط§طھ ط¹ظ„ظ‰ ط§ظ„ظ…ط´ط±ظˆط¹ ط§ظ„ط¢ظ†."
    : hasUploadingAttachment
      ? "ظٹظˆط¬ط¯ ظ…ط±ظپظ‚ ظ‚ظٹط¯ ط§ظ„ط±ظپط¹ ط§ظ„ط¢ظ†. ط§ظ†طھط¸ط± ط­طھظ‰ ظٹظƒطھظ…ظ„ ظ‚ط¨ظ„ طھظ†ظپظٹط° ط§ظ„ط­ظپط¸ ط§ظ„ظ†ظ‡ط§ط¦ظٹ."
      : coverUploading || galleryUploading || completionGalleryUploading
        ? "ظٹظˆط¬ط¯ ط±ظپط¹ ظˆط³ط§ط¦ط· ط¬ط§ط±ظچ ط§ظ„ط¢ظ†. ط³طھط¨ظ‚ظ‰ ط§ظ„ط£ط²ط±ط§ط± ظ…ط¹ط·ظ„ط© ط­طھظ‰ ظٹظƒطھظ…ظ„."
        : isDirty
          ? "ظ‡ظ†ط§ظƒ طھط¹ط¯ظٹظ„ط§طھ ط؛ظٹط± ظ…ط­ظپظˆط¸ط©. ظٹظ…ظƒظ†ظƒ ط­ظپط¸ظ‡ط§ ط§ظ„ط¢ظ† ط£ظˆ ط§ط³طھط¹ط§ط¯ط© ط¢ط®ط± ظ†ط³ط®ط© ظ…ط­ظپظˆط¸ط©."
          : "ظƒظ„ ط§ظ„طھط¹ط¯ظٹظ„ط§طھ ط§ظ„ط­ط§ظ„ظٹط© ظ…ط­ظپظˆط¸ط©طŒ ظˆظٹظ…ظƒظ†ظƒ ظ…طھط§ط¨ط¹ط© ط§ظ„ظ…ط±ط§ط¬ط¹ط© ط£ظˆ ط§ظ„ط§ظ†طھظ‚ط§ظ„ ظ„ظ„ظ…ط¹ط§ظٹظ†ط©.";
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
          ط§ظ„ط¹ظˆط¯ط©
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12 hover:text-white"
          onClick={() => setLocation(previewPath)}
        >
          <Eye className="ml-2 h-4 w-4" />
          ظ…ط¹ط§ظٹظ†ط© ط§ظ„ظ…ط´ط±ظˆط¹
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12 hover:text-white disabled:border-white/10 disabled:text-white/45"
          disabled={!canRestore}
          onClick={restoreSavedState}
        >
          <RotateCcw className="ml-2 h-4 w-4" />
          ط¥ظ„ط؛ط§ط، ط§ظ„طھط¹ط¯ظٹظ„ط§طھ
        </Button>
        <Button
          type="submit"
          form={formId}
          className="h-11 rounded-2xl bg-white px-5 text-slate-950 shadow-[0_20px_35px_-22px_rgba(255,255,255,0.7)] hover:bg-slate-100 disabled:bg-white/80"
          disabled={isBusy || !isDirty}
        >
          <Save className="ml-2 h-4 w-4" />
          {saving ? "ط¬ط§ط±ظچ ط­ظپط¸ ط§ظ„طھط؛ظٹظٹط±ط§طھ..." : "ط­ظپط¸ ط§ظ„طھط؛ظٹظٹط±ط§طھ"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-right shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            ط±ظ‚ظ… ط§ظ„ظ…ط´ط±ظˆط¹
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {cleanStr(formData.issueNumber) || projectId?.slice(0, 8) || "â€”"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-right shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            ط¢ط®ط± ظ…ط²ط§ظ…ظ†ط©
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
        footerTitle="ط¥ط¬ط±ط§ط،ط§طھ ط§ظ„ط­ظپط¸"
        galleryUploading={galleryUploading}
        galleryUrls={galleryUrls}
        handleAttachmentFileUpload={handleAttachmentFileUpload}
        handleCompletionGalleryImageUpload={handleCompletionGalleryImageUpload}
        handleCoverImageUpload={handleCoverImageUpload}
        handleGalleryImageUpload={handleGalleryImageUpload}
        handleSubmit={handleSubmit}
        hasUploadingAttachment={hasUploadingAttachment}
        headerActions={headerActions}
        headerBadgeText="Project Editing"
        headerContext={headerContext}
        headerDescription={headerDescription}
        headerMetrics={headerMetrics}
        headerTitle={headerTitle}
        highlightRows={highlightRows}
        isBusy={isBusy}
        milestoneRows={milestoneRows}
        primaryActionLabel="ط­ظپط¸ ط§ظ„طھط؛ظٹظٹط±ط§طھ"
        primaryActionLoadingLabel="ط¬ط§ط±ظچ ط­ظپط¸ ط§ظ„طھط؛ظٹظٹط±ط§طھ..."
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
        sidebarChecklistDescription="ط§ظ„ط¹ظ†ط§طµط± ط§ظ„طھط§ظ„ظٹط© طھط³ط§ط¹ط¯ ط§ظ„ظپط±ظٹظ‚ ط¹ظ„ظ‰ ط­ظپط¸ ط§ظ„ظ…ط´ط±ظˆط¹ ط¯ظˆظ† ط£ط®ط·ط§ط، ط£ظˆ ظ†ظ‚طµ ظپظٹ ط§ظ„ظ…ط¹ظ„ظˆظ…ط§طھ."
        sidebarChecklistTitle="ط¬ط§ظ‡ط²ظٹط© ط§ظ„ط­ظپط¸"
        sidebarDescription="ط§ظ†طھظ‚ظ„ ط¨ظٹظ† ط£ظ‚ط³ط§ظ… ط§ظ„ظ…ط´ط±ظˆط¹ ظ…ط¹ ظ…ظ„ط®طµ ط­ظٹظ‘ ظ„ط­ط§ظ„ط© ط§ظ„طھط¹ط¯ظٹظ„ ظˆط§ظ„ظ…ط­طھظˆظ‰ ظˆط§ظ„ظˆط³ط§ط¦ط· ظ‚ط¨ظ„ ط§ظ„ظ†ط´ط± ط£ظˆ ط§ظ„ط¥ط؛ظ„ط§ظ‚."
        sidebarMetrics={sidebarMetrics}
        sidebarTitle="ظ„ظˆط­ط© ط¥ط¯ط§ط±ط© ط§ظ„ظ…ط´ط±ظˆط¹"
        saving={saving}
        totalAssets={totalAssets}
        workspaceIdLabel="ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ…ط´ط±ظˆط¹"
        workspaceIdValue={projectId?.slice(0, 8) ?? "â€”"}
      />
    </DashboardLayout>
  );

  /* =========================
     UI
  ========================= */
  const coverPreview = normalizeCover(formData.coverImage);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Top */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">طھط¹ط¯ظٹظ„ ط§ظ„ظ…ط´ط±ظˆط¹</h1>
            <p className="text-muted-foreground">
              ط¢ط®ط± طھط­ط¯ظٹط«: {safeDateLabel(meta.updatedAt)} â€¢ ط¥ظ†ط´ط§ط،: {safeDateLabel(meta.createdAt)}
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/admin/projects")}>
            <ArrowRight className="w-4 h-4 ml-2" />
            ط±ط¬ظˆط¹
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic */}
          <Card>
            <CardHeader>
              <CardTitle>ط§ظ„ظ…ط¹ظ„ظˆظ…ط§طھ ط§ظ„ط£ط³ط§ط³ظٹط©</CardTitle>
              <CardDescription>ط§ظ„ط¹ظ†ط§ظˆظٹظ† ظˆط§ظ„ظˆطµظپ</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">ط§ظ„ط¹ظ†ظˆط§ظ† (ط¹ط±ط¨ظٹ)</Label>
                  <Input
                    dir="rtl"
                    className="text-right"
                    value={formData.titleAr}
                    onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">ط§ظ„ط¹ظ†ظˆط§ظ† (ط¥ظ†ط¬ظ„ظٹط²ظٹ)</Label>
                  <Input
                    dir="ltr"
                    className="text-left"
                    value={formData.titleEn}
                    onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">ط§ظ„ظˆطµظپ (ط¹ط±ط¨ظٹ)</Label>
                <Textarea
                  rows={4}
                  dir="rtl"
                  className="py-3 text-right leading-8"
                  value={formData.descriptionAr}
                  onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">ط§ظ„ظˆطµظپ (ط¥ظ†ط¬ظ„ظٹط²ظٹ)</Label>
                <Textarea
                  rows={4}
                  dir="ltr"
                  className="py-3 text-left leading-8"
                  value={formData.descriptionEn}
                  onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Meta */}
          <Card>
            <CardHeader>
              <CardTitle>ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط´ط±ظˆط¹</CardTitle>
              <CardDescription>ط§ظ„ظ†ظˆط¹طŒ ط§ظ„ط­ط§ظ„ط©طŒ ط±ظ‚ظ… ط§ظ„ط¥طµط¯ط§ط±طŒ ط§ظ„ظ…ظˆظ‚ط¹</CardDescription>
            </CardHeader>

            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">ظ†ظˆط¹ ط§ظ„ظ…ط´ط±ظˆط¹</Label>
                <Select
                  value={formData.projectType}
                  onValueChange={(v) => setFormData({ ...formData, projectType: v as ProjectType })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue placeholder="ط§ط®طھط± ط§ظ„ظ†ظˆط¹" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sukuk">ط§ط³طھط«ظ…ط§ط± ط¨ط§ظ„طµظƒظˆظƒ</SelectItem>
                    <SelectItem value="land_development">طھط·ظˆظٹط± ط£ط±ط§ط¶ظٹ</SelectItem>
                    <SelectItem value="vip_exclusive">VIP ط­طµط±ظٹ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">ط§ظ„ط­ط§ظ„ط©</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as ProjectStatus })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue placeholder="ط§ط®طھط± ط§ظ„ط­ط§ظ„ط©" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">ظ‚ط±ظٹط¨ط§</SelectItem>
                    <SelectItem value="published">ظ…ظ†ط´ظˆط±</SelectItem>
                    <SelectItem value="closed">ظ…ط؛ظ„ظ‚</SelectItem>
                    <SelectItem value="completed">ظ…ظƒطھظ…ظ„</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">ط±ظ‚ظ… ط§ظ„ط¥طµط¯ط§ط± </Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  value={formData.issueNumber}
                  onChange={(e) => setFormData({ ...formData, issueNumber: e.target.value })}
                  placeholder="ظ…ط«ط§ظ„: 2026-01"
                />
              </div>

              <div>
                <Label className="mb-2 block">ط§ظ„ظ…ظˆظ‚ط¹ (ط¹ط±ط¨ظٹ)</Label>
                <Input
                  dir="rtl"
                  className="text-right"
                  value={formData.locationAr}
                  onChange={(e) => setFormData({ ...formData, locationAr: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <Label className="mb-2 block">ط§ظ„ظ…ظˆظ‚ط¹ (ط¥ظ†ط¬ظ„ظٹط²ظٹ)</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  value={formData.locationEn}
                  onChange={(e) => setFormData({ ...formData, locationEn: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader>
              <CardTitle>ط§ظ„طµظˆط±</CardTitle>
              <CardDescription>طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ + ظ…ط¹ط±ط¶ ط§ظ„طµظˆط± (ظƒظ„ ط³ط·ط±)</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4 items-start">
                <div className="space-y-2">
                  <Label>طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ</Label>
                  <Input
                    value={formData.coverImage}
                    onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                    placeholder="ظ…ط«ط§ظ„: HOOM-HERO.png ط£ظˆ /HOOM-HERO.png ط£ظˆ https://..."
                  />
                  <p className="text-xs text-muted-foreground">
                    ط¥ط°ط§ ط§ظ„طµظˆط±ط© ط¯ط§ط®ظ„ public ط§ظƒطھط¨ ط§ط³ظ… ط§ظ„ظ…ظ„ظپ ط£ظˆ ط§ط¨ط¯ط£ ط¨ظ€ /
                  </p>
                  <Label className="mt-2 block">ط£ظˆ ط¥ط±ظپط§ظ‚ طµظˆط±ط© ط؛ظ„ط§ظپ</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={coverUploading}
                    onChange={(e) => {
                      void handleCoverImageUpload(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                  />
                  {coverUploading ? (
                    <p className="text-xs text-muted-foreground">ط¬ط§ط±ظٹ ط±ظپط¹ طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ...</p>
                  ) : null}
                </div>

                <div className="rounded-lg border overflow-hidden bg-muted h-[180px] flex items-center justify-center">
                  {coverPreview ? (
                    <img
                      src={coverPreview}
                      alt="cover preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">ظ„ط§ طھظˆط¬ط¯ طµظˆط±ط© ط؛ظ„ط§ظپ</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>ظ…ط¹ط±ط¶ ط§ظ„طµظˆط± (gallery) â€” ظƒظ„ ط±ط§ط¨ط·/ط§ط³ظ… ظ…ظ„ظپ ظپظٹ ط³ط·ط±</Label>
                <Textarea
                  rows={6}
                  value={formData.galleryText}
                  onChange={(e) => setFormData({ ...formData, galleryText: e.target.value })}
                  placeholder={`HOOM-HERO.png\n/bg-01-l.png\nhttps://...`}
                />
                <Label className="mt-2 block">ط£ظˆ ط¥ط±ظپط§ظ‚ طµظˆط± ظ„ظ„ظ…ط¹ط±ط¶</Label>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={galleryUploading}
                  onChange={(e) => {
                    void handleGalleryImageUpload(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                {galleryUploading ? (
                  <p className="text-xs text-muted-foreground">ط¬ط§ط±ظٹ ط±ظپط¹ طµظˆط± ط§ظ„ظ…ط¹ط±ط¶...</p>
                ) : null}
              </div>

              {galleryUrls.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {galleryUrls.slice(0, 8).map((url, idx) => {
                    const src = normalizeCover(url);
                    return (
                      <div key={idx} className="rounded-lg border overflow-hidden bg-muted h-[120px]">
                        <img
                          src={src}
                          alt={`gallery-${idx}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Highlights */}
          <Card>
            <CardHeader>
              <CardTitle>ظ…ظ…ظٹط²ط§طھ ط§ظ„ظ…ط´ط±ظˆط¹</CardTitle>
              <CardDescription>ظƒظ„ ظ…ظٹط²ط© ظپظٹ ط®ط§ظ†ط© ظ…ط³طھظ‚ظ„ط©</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {highlightRows.map((value, idx) => (
                <div key={`highlight-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <Input
                    dir="rtl"
                    className="text-right"
                    value={value}
                    onChange={(e) =>
                      setHighlightRows((prev) =>
                        prev.map((row, i) => (i === idx ? e.target.value : row))
                      )
                    }
                    placeholder={`ط§ظ„ظ…ظٹط²ط© ${idx + 1}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setHighlightRows((prev) =>
                        prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                      )
                    }
                    disabled={highlightRows.length === 1}
                  >
                    ط­ط°ظپ
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setHighlightRows((prev) => [...prev, ""])}
              >
                ط¥ط¶ط§ظپط© ظ…ظٹط²ط©
              </Button>
              <p className="text-xs text-muted-foreground">
                ProjectDetails ط¨ظٹط¹ط±ط¶ظ‡ط§ طھظ„ظ‚ط§ط¦ظٹ ط¥ط°ط§ ظپظٹظ‡ ط¹ظ†ط§طµط±.
              </p>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle>ظ…ط±ظپظ‚ط§طھ</CardTitle>
              <CardDescription>ظƒظ„ ظ…ط±ظپظ‚ ظپظٹ طµظپ: ط§ظ„ط§ط³ظ… + ظ…ظ„ظپ ظ…ط±ظپظˆط¹ + ط±ط§ط¨ط· ط®ط§ط±ط¬ظٹ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {attachmentRows.map((row, idx) => (
                <div key={`attachment-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>ط§ظ„ط§ط³ظ…</Label>
                      <Input
                        dir="rtl"
                        className="text-right"
                        value={row.name}
                        onChange={(e) =>
                          setAttachmentRows((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, name: e.target.value } : item
                            )
                          )
                        }
                        placeholder={`ط§ط³ظ… ط§ظ„ظ…ط±ظپظ‚ ${idx + 1}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>ط±ط§ط¨ط· ط®ط§ط±ط¬ظٹ (ط§ط®طھظٹط§ط±ظٹ)</Label>
                      <Input
                        dir="ltr"
                        className="text-left"
                        value={row.externalUrl}
                        onChange={(e) =>
                          setAttachmentRows((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, externalUrl: e.target.value } : item
                            )
                          )
                        }
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div className="space-y-1">
                      <Label>ط¥ط±ظپط§ظ‚ ظ…ظ„ظپ</Label>
                      <Input
                        type="file"
                        onChange={(e) => handleAttachmentFileUpload(idx, e.target.files?.[0] ?? null)}
                        disabled={row.uploading}
                      />
                      {row.uploading ? (
                        <p className="text-xs text-muted-foreground">ط¬ط§ط±ظٹ ط±ظپط¹ ط§ظ„ظ…ظ„ظپ...</p>
                      ) : row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline break-all"
                        >
                          ط¹ط±ط¶ ط§ظ„ظ…ظ„ظپ ط§ظ„ظ…ط±ظپظˆط¹
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground">ظ„ظ… ظٹطھظ… ط±ظپط¹ ظ…ظ„ظپ ط¨ط¹ط¯.</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setAttachmentRows((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, url: "" } : item))
                        )
                      }
                      disabled={!row.url || row.uploading}
                    >
                      ظ…ط³ط­ ط§ظ„ظ…ظ„ظپ
                    </Button>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setAttachmentRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                        )
                      }
                      disabled={attachmentRows.length === 1}
                    >
                      ط­ط°ظپ ط§ظ„ظ…ط±ظپظ‚
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setAttachmentRows((prev) => [...prev, newAttachmentRow()])}
              >
                ط¥ط¶ط§ظپط© ظ…ط±ظپظ‚
              </Button>
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader>
              <CardTitle>ط§ظ„ظ…ط±ط§ط­ظ„</CardTitle>
              <CardDescription>ظƒظ„ ظ…ط±ط­ظ„ط© ظپظٹ طµظپ ظ…ط³طھظ‚ظ„: ط¹ظ†ظˆط§ظ† + طھط§ط±ظٹط® + ط­ط§ظ„ط© + ظˆطµظپ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestoneRows.map((row, idx) => (
                <div key={`milestone-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>ط§ظ„ط¹ظ†ظˆط§ظ†</Label>
                      <Input
                        dir="rtl"
                        className="text-right"
                        value={row.title}
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, title: e.target.value } : item
                            )
                          )
                        }
                        placeholder={`ط¹ظ†ظˆط§ظ† ط§ظ„ظ…ط±ط­ظ„ط© ${idx + 1}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>ط§ظ„طھط§ط±ظٹط®</Label>
                      <Input
                        dir="ltr"
                        className="text-left"
                        value={row.date}
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, date: e.target.value } : item
                            )
                          )
                        }
                        placeholder="2026-02"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>ط§ظ„ط­ط§ظ„ط©</Label>
                      <Input
                        dir="rtl"
                        className="text-right"
                        value={row.status}
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, status: e.target.value } : item
                            )
                          )
                        }
                        placeholder="ظ‚ظٹط¯ ط§ظ„طھظ†ظپظٹط°"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>ط§ظ„ظˆطµظپ</Label>
                      <Input
                        dir="rtl"
                        className="text-right"
                        value={row.description}
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, description: e.target.value } : item
                            )
                          )
                        }
                        placeholder="ظˆطµظپ ظ…ط®طھطµط± ظ„ظ„ظ…ط±ط­ظ„ط©"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setMilestoneRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                        )
                      }
                      disabled={milestoneRows.length === 1}
                    >
                      ط­ط°ظپ ط§ظ„ظ…ط±ط­ظ„ط©
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setMilestoneRows((prev) => [...prev, newMilestoneRow()])}
              >
                ط¥ط¶ط§ظپط© ظ…ط±ط­ظ„ط©
              </Button>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle>ط§ظ„ط£ط³ط¦ظ„ط© ط§ظ„ط´ط§ط¦ط¹ط© (faq)</CardTitle>
              <CardDescription>ظƒظ„ ط³ط¤ط§ظ„ ظپظٹ طµظپ ظ…ط³طھظ‚ظ„: ط³ط¤ط§ظ„ + ط¬ظˆط§ط¨</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {faqRows.map((row, idx) => (
                <div key={`faq-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div className="space-y-1">
                    <Label>ط§ظ„ط³ط¤ط§ظ„</Label>
                    <Input
                      dir="rtl"
                      className="text-right"
                      value={row.q}
                      onChange={(e) =>
                        setFaqRows((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, q: e.target.value } : item
                          )
                        )
                      }
                      placeholder={`ط§ظ„ط³ط¤ط§ظ„ ${idx + 1}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>ط§ظ„ط¬ظˆط§ط¨</Label>
                    <Textarea
                      rows={2}
                      dir="rtl"
                      className="text-right"
                      value={row.a}
                      onChange={(e) =>
                        setFaqRows((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, a: e.target.value } : item
                          )
                        )
                      }
                      placeholder="ط§ظƒطھط¨ ط§ظ„ط¬ظˆط§ط¨"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setFaqRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                        )
                      }
                      disabled={faqRows.length === 1}
                    >
                      ط­ط°ظپ ط§ظ„ط³ط¤ط§ظ„
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setFaqRows((prev) => [...prev, newFaqRow()])}
              >
                ط¥ط¶ط§ظپط© ط³ط¤ط§ظ„
              </Button>
            </CardContent>
          </Card>

          {isCompletionStatus(formData.status) && (
            <Card>
              <CardHeader>
                <CardTitle>ط§ظ„ظ…ط­طھظˆظ‰ ط§ظ„ط®طھط§ظ…ظٹ ظ„ظ„ظ…ط´ط±ظˆط¹</CardTitle>
                <CardDescription>
                  ظ‡ط°ط§ ط§ظ„ظ‚ط³ظ… ظٹط؛ط°ظٹ طھط¬ط±ط¨ط© ط§ظ„ظ…ط´ط±ظˆط¹ ط§ظ„ظ…ظƒطھظ…ظ„ ظˆظٹط¸ظ‡ط± ظپظ‚ط· ط¹ظ†ط¯ ط¥ط؛ظ„ط§ظ‚ ط§ظ„ظ…ط´ط±ظˆط¹ ط£ظˆ ط§ظƒطھظ…ط§ظ„ظ‡.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>ظ†ط¸ط±ط© ط¹ط§ظ…ط© ط¹ظ„ظ‰ ط§ظ„ظ…ط´ط±ظˆط¹</Label>
                    <Textarea
                      rows={4}
                      dir="rtl"
                      className="text-right"
                      value={formData.completionOverviewAr}
                      onChange={(e) =>
                        setFormData({ ...formData, completionOverviewAr: e.target.value })
                      }
                      placeholder="ط§ظƒطھط¨ ظ†ط¸ط±ط© ط¹ط§ظ…ط© ظ…ط§ ط¨ط¹ط¯ ط§ظ„طھظ†ظپظٹط° ط¨طµظٹط؛ط© ط®طھط§ظ…ظٹط©."
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>ظ…ظ„ط®طµ ط§ظ„ظ…ط´ط±ظˆط¹</Label>
                    <Textarea
                      rows={3}
                      dir="rtl"
                      className="text-right"
                      value={formData.completionSummaryAr}
                      onChange={(e) =>
                        setFormData({ ...formData, completionSummaryAr: e.target.value })
                      }
                      placeholder="ظ…ظ„ط®طµ ظ‚طµظٹط± ظٹط´ط±ط­ ظ…ط§ طھط­ظ‚ظ‚ ط¨ط¹ط¯ ط¥ظ‚ظپط§ظ„ ط§ظ„ظ…ط´ط±ظˆط¹."
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>ظ†طھط§ط¦ط¬ ط§ظ„ظ…ط´ط±ظˆط¹</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCompletionResultRows((prev) => [...prev, ""])}
                    >
                      ط¥ط¶ط§ظپط© ظ†طھظٹط¬ط©
                    </Button>
                  </div>

                  {completionResultRows.map((row, idx) => (
                    <div key={`completion-result-${idx}`} className="rounded-md border p-3 space-y-3">
                      <Textarea
                        rows={3}
                        dir="rtl"
                        className="text-right"
                        value={row}
                        onChange={(e) =>
                          setCompletionResultRows((prev) =>
                            prev.map((item, i) => (i === idx ? e.target.value : item))
                          )
                        }
                        placeholder={`ط§ظ„ظ†طھظٹط¬ط© ${idx + 1}`}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setCompletionResultRows((prev) =>
                              prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                            )
                          }
                          disabled={completionResultRows.length === 1}
                        >
                          ط­ط°ظپ ط§ظ„ظ†طھظٹط¬ط©
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>ظ…ط®ط±ط¬ط§طھ ط§ظ„ظ…ط´ط±ظˆط¹</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setCompletionOutputRows((prev) => [...prev, newCompletionOutputRow()])
                      }
                    >
                      ط¥ط¶ط§ظپط© ظ…ط®ط±ط¬
                    </Button>
                  </div>

                  {completionOutputRows.map((row, idx) => (
                    <div key={`completion-output-${idx}`} className="rounded-md border p-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>ط§ظ„ط¹ظ†ظˆط§ظ†</Label>
                          <Input
                            dir="rtl"
                            className="text-right"
                            value={row.titleAr}
                            onChange={(e) =>
                              setCompletionOutputRows((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, titleAr: e.target.value } : item
                                )
                              )
                            }
                            placeholder={`ط¹ظ†ظˆط§ظ† ط§ظ„ظ…ط®ط±ط¬ ${idx + 1}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>ظˆط³ظ… ط¥ط¶ط§ظپظٹ</Label>
                          <Input
                            dir="rtl"
                            className="text-right"
                            value={row.metaAr}
                            onChange={(e) =>
                              setCompletionOutputRows((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, metaAr: e.target.value } : item
                                )
                              )
                            }
                            placeholder="ظ…ط«ط§ظ„: طھط³ظ„ظٹظ… ظ†ظ‡ط§ط¦ظٹ"
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>ط§ظ„ظˆطµظپ</Label>
                          <Textarea
                            rows={3}
                            dir="rtl"
                            className="text-right"
                            value={row.descriptionAr}
                            onChange={(e) =>
                              setCompletionOutputRows((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, descriptionAr: e.target.value } : item
                                )
                              )
                            }
                            placeholder="طµظپ ظ‡ط°ط§ ط§ظ„ظ…ط®ط±ط¬ ط¨ط´ظƒظ„ ظˆط§ط¶ط­."
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setCompletionOutputRows((prev) =>
                              prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                            )
                          }
                          disabled={completionOutputRows.length === 1}
                        >
                          ط­ط°ظپ ط§ظ„ظ…ط®ط±ط¬
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>ظ…ظ„ط§ط­ط¸ط§طھ / ظ…ظ„ط®طµ ظ†ظ‡ط§ط¦ظٹ</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCompletionFinalNoteRows((prev) => [...prev, ""])}
                    >
                      ط¥ط¶ط§ظپط© ظ…ظ„ط§ط­ط¸ط©
                    </Button>
                  </div>

                  {completionFinalNoteRows.map((row, idx) => (
                    <div key={`completion-note-${idx}`} className="rounded-md border p-3 space-y-3">
                      <Textarea
                        rows={3}
                        dir="rtl"
                        className="text-right"
                        value={row}
                        onChange={(e) =>
                          setCompletionFinalNoteRows((prev) =>
                            prev.map((item, i) => (i === idx ? e.target.value : item))
                          )
                        }
                        placeholder={`ط§ظ„ظ…ظ„ط§ط­ط¸ط© ${idx + 1}`}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setCompletionFinalNoteRows((prev) =>
                              prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                            )
                          }
                          disabled={completionFinalNoteRows.length === 1}
                        >
                          ط­ط°ظپ ط§ظ„ظ…ظ„ط§ط­ط¸ط©
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>طµظˆط± ظ…ط§ ط¨ط¹ط¯ ط§ظ„طھظ†ظپظٹط°</Label>
                  <Textarea
                    rows={4}
                    dir="ltr"
                    className="text-left"
                    value={formData.completionGalleryText}
                    onChange={(e) =>
                      setFormData({ ...formData, completionGalleryText: e.target.value })
                    }
                    placeholder="https://..."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={completionGalleryUploading}
                      onChange={(e) => {
                        void handleCompletionGalleryImageUpload(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>

                  {completionGalleryUrls.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {completionGalleryUrls.map((url, idx) => (
                        <div key={`${url}-${idx}`} className="rounded-md border overflow-hidden">
                          <img
                            src={normalizeCover(url)}
                            alt={`completion-gallery-${idx + 1}`}
                            className="h-28 w-full object-cover"
                          />
                          <div className="p-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  completionGalleryText: completionGalleryUrls
                                    .filter((_, imageIndex) => imageIndex !== idx)
                                    .join("\n"),
                                })
                              }
                            >
                              ط­ط°ظپ ط§ظ„طµظˆط±ط©
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Finance */}
          <Card>
            <CardHeader>
              <CardTitle>ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط§ظ„ظٹط©</CardTitle>
              <CardDescription>ط£ط±ظ‚ط§ظ… ط§ظ„ط§ط³طھط«ظ…ط§ط± ظˆط§ظ„طھظ‚ط¯ظ…</CardDescription>
            </CardHeader>

            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ظ…ط³طھظ‡ط¯ظپ </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ط­ط§ظ„ظٹ</Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.currentAmount}
                  onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">ط§ظ„ط­ط¯ ط§ظ„ط£ط¯ظ†ظ‰</Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.minInvestment}
                  onChange={(e) => setFormData({ ...formData, minInvestment: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">ط§ظ„ط¹ط§ط¦ط¯ ط§ظ„ط³ظ†ظˆظٹ % </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.annualReturn}
                  onChange={(e) => setFormData({ ...formData, annualReturn: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">ط§ظ„ظ…ط¯ط© ط¨ط§ظ„ط´ظ‡ظˆط± </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">ط¹ط¯ط¯ ط§ظ„ظ…ط³طھط«ظ…ط±ظٹظ† </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.investorsCount}
                  onChange={(e) => setFormData({ ...formData, investorsCount: e.target.value })}
                />
              </div>

              <div className="md:col-span-3 text-sm text-muted-foreground">
                ط§ظ„طھظ‚ط¯ظ… ط§ظ„طھظ‚ط±ظٹط¨ظٹ (طھظ…ظˆظٹظ„ ظپظ‚ط·):{" "}
                <b>
                  {(() => {
                    const t = toNumOrNull(formData.targetAmount) ?? 0;
                    const c = toNumOrNull(formData.currentAmount) ?? 0;
                    const pct = t ? Math.min(100, (c / t) * 100) : 0;
                    return `${pct.toFixed(1)}%`;
                  })()}
                </b>
              </div>
            </CardContent>
          </Card>

          {/* âœ… Progress control */}
          <Card>
            <CardHeader>
              <CardTitle>ظ…طµط¯ط± ط§ظ„طھظ‚ط¯ظ…</CardTitle>
              <CardDescription>ط§ط®طھط± ظƒظٹظپ ظ†ط­ط³ط¨ ط§ظ„طھظ‚ط¯ظ… ظپظٹ طµظپط­ط© طھظپط§طµظٹظ„ ط§ظ„ظ…ط´ط±ظˆط¹</CardDescription>
            </CardHeader>

            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">ط·ط±ظٹظ‚ط© ط§ظ„ط­ط³ط§ط¨</Label>
                <Select
                  value={formData.progressMode}
                  onValueChange={(v) =>
                    setFormData({ ...formData, progressMode: v as ProgressMode })
                  }
                >
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="funding">ط­ط³ط¨ ط§ظ„طھظ…ظˆظٹظ„ ظپظ‚ط·</SelectItem>
                    <SelectItem value="milestones">ط­ط³ط¨ ط§ظ„ظ…ط±ط§ط­ظ„ ظپظ‚ط·</SelectItem>
                    <SelectItem value="hybrid">ظ‡ط¬ظٹظ† (طھظ…ظˆظٹظ„ + ظ…ط±ط§ط­ظ„)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.progressMode === "hybrid" && (
                <>
                  <div>
                    <Label className="mb-2 block">ظ…ط¹ط¯ظ„ ط§ظ„طھظ…ظˆظٹظ„ (%)</Label>
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      className="text-left"
                      value={formData.progressFundingWeight}
                      onChange={(e) =>
                        setFormData({ ...formData, progressFundingWeight: e.target.value })
                      }
                      placeholder="60"
                    />
                  </div>

                  <div>
                    <Label className="mb-2 block">ظ…ط¹ط¯ظ„ ط§ظ„ظ…ط±ط§ط­ظ„ (%)</Label>
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      className="text-left"
                      value={formData.progressMilestonesWeight}
                      onChange={(e) =>
                        setFormData({ ...formData, progressMilestonesWeight: e.target.value })
                      }
                      placeholder="40"
                    />
                  </div>

                  <div className="md:col-span-3 text-sm text-muted-foreground">
                    ط¥ط°ط§ ظ…ط¬ظ…ظˆط¹ ط§ظ„ط£ظˆط²ط§ظ† ظ„ظٹط³ 100طŒ ط§ظ„ظ†ط¸ط§ظ… ظٹط·ط¨ظ‘ط¹ظ‡ط§ طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ط£ط«ظ†ط§ط، ط§ظ„ط­ط³ط§ط¨.
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Flags */}
          <Card>
            <CardHeader>
              <CardTitle>ط®ظٹط§ط±ط§طھ ط¥ط¶ط§ظپظٹط©</CardTitle>
              <CardDescription>طھظ…ظٹظٹط² ط§ظ„ظ…ط´ط±ظˆط¹ ظˆVIP</CardDescription>
            </CardHeader>

            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">ظ…ظ…ظٹط² (featured)</Label>
                <Select
                  value={formData.featured}
                  onValueChange={(v) => setFormData({ ...formData, featured: v as "true" | "false" })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">ظ„ط§</SelectItem>
                    <SelectItem value="true">ظ†ط¹ظ…</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">VIP (isVip)</Label>
                <Select
                  value={formData.isVip}
                  onValueChange={(v) => setFormData({ ...formData, isVip: v as "true" | "false" })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">ظ„ط§</SelectItem>
                    <SelectItem value="true">ظ†ط¹ظ…</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">ظ…ط³طھظˆظ‰ VIP (vipTier)</Label>
                <Select
                  value={formData.vipTier}
                  onValueChange={(v) => setFormData({ ...formData, vipTier: v as VipTier })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/admin/projects")}
              disabled={saving || coverUploading || galleryUploading || completionGalleryUploading}
            >
              ط¥ظ„ط؛ط§ط،
            </Button>

            <Button
              type="submit"
              disabled={saving || coverUploading || galleryUploading || completionGalleryUploading}
              className="bg-[#F2B705] hover:bg-[#d9a504]"
            >
              <Save className="w-4 h-4 ml-2" />
              {saving ? "ط¬ط§ط±ظٹ ط§ظ„ط­ظپط¸..." : "ط­ظپط¸ ط§ظ„طھط؛ظٹظٹط±ط§طھ"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

