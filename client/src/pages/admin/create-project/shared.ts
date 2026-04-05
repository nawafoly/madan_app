import type {
  ChangeEvent,
  Dispatch,
  FormEvent,
  ReactNode,
  SetStateAction,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleHelp,
  Crown,
  Gauge,
  ImagePlus,
  Landmark,
  ListChecks,
  Paperclip,
  Sparkles,
  type LucideIcon as LucideIconType,
} from "lucide-react";

export type ProjectType = "sukuk" | "land_development" | "vip_exclusive";
export type ProjectStatus = "draft" | "published" | "closed" | "completed";
export type VipTier = "none" | "silver" | "gold" | "platinum";
export type ProgressMode = "funding" | "milestones" | "hybrid";

export type Attachment = { name?: string; url?: string; externalUrl?: string };
export type Milestone = {
  title?: string;
  date?: string;
  status?: string;
  description?: string;
};
export type Faq = { q?: string; a?: string };
export type AttachmentRow = {
  name: string;
  url: string;
  externalUrl: string;
  uploading?: boolean;
};
export type MilestoneRow = {
  title: string;
  date: string;
  status: string;
  description: string;
};
export type FaqRow = { q: string; a: string };
export type CompletionOutput = {
  titleAr: string;
  descriptionAr: string;
  metaAr?: string;
};
export type CompletionOutputRow = {
  titleAr: string;
  descriptionAr: string;
  metaAr: string;
};
export type CompletionContent = {
  overviewAr: string;
  summaryAr: string;
  resultsAr: string[];
  outputs: CompletionOutput[];
  finalNotesAr: string[];
  gallery: string[];
};

export type SectionConfig = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: LucideIconType;
};

export const FINAL_SETTINGS_SECTION_ID = "final_settings";
export const LEGACY_FINAL_SETTINGS_SECTION_IDS = [
  "completion",
  "progress",
  "options",
] as const;

export type FormDataState = {
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  projectType: ProjectType;
  status: ProjectStatus;
  issueNumber: string;
  locationAr: string;
  locationEn: string;
  coverImage: string;
  galleryText: string;
  targetAmount: string;
  currentAmount: string;
  minInvestment: string;
  annualReturn: string;
  duration: string;
  investorsCount: string;
  progressMode: ProgressMode;
  progressFundingWeight: string;
  progressMilestonesWeight: string;
  featured: "true" | "false";
  isVip: "true" | "false";
  vipTier: VipTier;
  completionOverviewAr: string;
  completionSummaryAr: string;
  completionGalleryText: string;
};

export type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type UploadDropzoneProps = {
  inputId: string;
  title: string;
  description: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export type SectionCardProps = {
  id: string;
  index: number;
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  headerAside?: ReactNode;
  status?: SectionCompletionStatus;
  toneClassName?: string;
};

export type FieldProps = {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

export type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: "default" | "dark";
  status?: SectionCompletionStatus;
  className?: string;
};

export type SummaryMetric = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
};

export type SectionCompletionStatus = "complete" | "incomplete";

type BuildSectionStatusMapArgs = {
  formData: FormDataState;
  highlightRows: string[];
  attachmentRows: AttachmentRow[];
  milestoneRows: MilestoneRow[];
  faqRows: FaqRow[];
  completionResultRows: string[];
  completionOutputRows: CompletionOutputRow[];
  completionFinalNoteRows: string[];
  completionGalleryUrls: string[];
};

const LEGACY_SECTION_DEFINITIONS: SectionConfig[] = [
  {
    id: "basic",
    title: "المعلومات الأساسية",
    shortTitle: "الأساسيات",
    description: "هوية المشروع النصية والعناوين والوصف التعريفي للمستثمرين.",
    icon: BriefcaseBusiness,
  },
  {
    id: "details",
    title: "بيانات المشروع",
    shortTitle: "البيانات",
    description: "النوع والحالة والإصدار والموقع ضمن بطاقة منظمة وواضحة.",
    icon: Building2,
  },
  {
    id: "media",
    title: "الصور والمعرض",
    shortTitle: "الوسائط",
    description: "إدارة صورة الغلاف ومعرض الصور داخل واجهة رفع أوضح وأكثر احترافية.",
    icon: ImagePlus,
  },
  {
    id: "highlights",
    title: "المميزات",
    shortTitle: "المميزات",
    description: "أبرز النقاط الاستثمارية للمشروع داخل repeater واضح ومنظم.",
    icon: Sparkles,
  },
  {
    id: "attachments",
    title: "المرفقات",
    shortTitle: "المرفقات",
    description: "الملفات والروابط الخارجية ضمن بطاقات مرفقات مؤسسية.",
    icon: Paperclip,
  },
  {
    id: "milestones",
    title: "المراحل",
    shortTitle: "المراحل",
    description: "خريطة تنفيذ المشروع بمراحل متتابعة وسهلة المراجعة.",
    icon: ListChecks,
  },
  {
    id: "faq",
    title: "الأسئلة الشائعة",
    shortTitle: "الأسئلة",
    description: "الأسئلة والإجابات التي يحتاجها المستثمر قبل اتخاذ القرار.",
    icon: CircleHelp,
  },
  {
    id: "completion",
    title: "محتوى الإقفال",
    shortTitle: "الإقفال",
    description:
      "بيانات ما بعد التنفيذ للمشاريع المغلقة والمكتملة، مع نتائج ومخرجات وصور ختامية قابلة للإدارة من لوحة التحكم.",
    icon: CheckCircle2,
  },
  {
    id: "finance",
    title: "البيانات المالية",
    shortTitle: "المالية",
    description: "الأرقام الاستثمارية الرئيسية داخل قسم مالي أكثر إبرازًا ووضوحًا.",
    icon: Landmark,
  },
  {
    id: "progress",
    title: "مصدر التقدم",
    shortTitle: "التقدم",
    description: "طريقة احتساب التقدم ونسب التمويل والمراحل بشكل مترابط بصريًا.",
    icon: Gauge,
  },
  {
    id: "options",
    title: "خيارات إضافية",
    shortTitle: "الخيارات",
    description: "تمييز المشروع وإعدادات VIP في لوحة تحكم أوضح وأقرب لطابع المنصات.",
    icon: Crown,
  },
];

export const SECTION_DEFINITIONS: SectionConfig[] = [
  ...LEGACY_SECTION_DEFINITIONS.filter(
    (section) => !LEGACY_FINAL_SETTINGS_SECTION_IDS.includes(section.id as any)
  ),
  {
    id: FINAL_SETTINGS_SECTION_ID,
    title: "الإعدادات الختامية",
    shortTitle: "الختامية",
    description:
      "تجميع مصدر التقدم والخيارات الإضافية والمحتوى الختامي ضمن مرحلة نهائية واحدة قبل الحفظ أو الإغلاق.",
    icon: CheckCircle2,
  },
];

export const projectTypeLabels: Record<ProjectType, string> = {
  sukuk: "استثمار بالصكوك",
  land_development: "تطوير أراضٍ",
  vip_exclusive: "VIP حصري",
};

export const statusLabels: Record<ProjectStatus, string> = {
  draft: "قريباً",
  published: "منشور",
  closed: "مغلق",
  completed: "مكتمل",
};

export const progressModeLabels: Record<ProgressMode, string> = {
  funding: "حسب التمويل فقط",
  milestones: "حسب المراحل فقط",
  hybrid: "هجين: تمويل + مراحل",
};

export const progressModeNarratives: Record<ProgressMode, string> = {
  funding:
    "سيتم احتساب نسبة التقدم اعتمادًا على تقدم التمويل فقط، وهو مناسب للمشاريع التي تُدار بحساسية مالية مباشرة.",
  milestones:
    "سيتم احتساب التقدم اعتمادًا على المراحل التنفيذية فقط، وهو مناسب للمشاريع التي تحتاج قراءة تشغيلية واضحة.",
  hybrid:
    "سيتم دمج التمويل والمراحل معًا، ما يعطي قراءة أكثر توازنًا بين الأداء المالي والتنفيذي للمشروع.",
};

export const vipTierLabels: Record<VipTier, string> = {
  none: "بدون",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

export function normalizeProjectBuilderSectionId(sectionId: string | null | undefined) {
  if (!sectionId) return "";
  return LEGACY_FINAL_SETTINGS_SECTION_IDS.includes(
    sectionId as (typeof LEGACY_FINAL_SETTINGS_SECTION_IDS)[number]
  )
    ? FINAL_SETTINGS_SECTION_ID
    : sectionId;
}

export function buildFinalSettingsMeta({
  formData,
  filledCompletionResults,
  filledCompletionOutputs,
  filledCompletionFinalNotes,
}: {
  formData: Pick<
    FormDataState,
    "featured" | "isVip" | "projectType" | "progressMode" | "status" | "vipTier"
  >;
  filledCompletionResults: number;
  filledCompletionOutputs: number;
  filledCompletionFinalNotes: number;
}) {
  const optionsSummary =
    formData.isVip === "true" || formData.projectType === "vip_exclusive"
      ? `VIP ${vipTierLabels[formData.vipTier]}`
      : formData.featured === "true"
        ? "مشروع مميز"
        : "إعدادات افتراضية";

  const completionSummary = !isCompletionStatus(formData.status)
    ? "المحتوى الختامي بعد الإغلاق"
    : [
        filledCompletionResults ? `${filledCompletionResults} نتائج` : "",
        filledCompletionOutputs ? `${filledCompletionOutputs} مخرجات` : "",
        filledCompletionFinalNotes ? `${filledCompletionFinalNotes} ملاحظات` : "",
      ]
        .filter(Boolean)
        .join(" · ") || "أضف المحتوى الختامي";

  return [progressModeLabels[formData.progressMode], optionsSummary, completionSummary]
    .filter(Boolean)
    .join(" · ");
}

export const inputClassName =
  "h-12 rounded-2xl border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all focus-visible:border-slate-400 focus-visible:ring-4 focus-visible:ring-slate-900/5";

export const textareaClassName =
  "min-h-[140px] rounded-2xl border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all focus-visible:border-slate-400 focus-visible:ring-4 focus-visible:ring-slate-900/5";

export const selectTriggerClassName =
  "h-12 rounded-2xl border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all focus:ring-4 focus:ring-slate-900/5";

export const newAttachmentRow = (): AttachmentRow => ({
  name: "",
  url: "",
  externalUrl: "",
});

export const newMilestoneRow = (): MilestoneRow => ({
  title: "",
  date: "",
  status: "",
  description: "",
});

export const newFaqRow = (): FaqRow => ({ q: "", a: "" });
export const newCompletionOutputRow = (): CompletionOutputRow => ({
  titleAr: "",
  descriptionAr: "",
  metaAr: "",
});

export function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

export function serializeProjectEditorSnapshot(snapshot: ProjectEditorSnapshot) {
  return JSON.stringify({
    formData: snapshot.formData,
    highlightRows: snapshot.highlightRows,
    attachmentRows: snapshot.attachmentRows.map((row) => ({
      name: row.name,
      url: row.url,
      externalUrl: row.externalUrl,
    })),
    milestoneRows: snapshot.milestoneRows,
    faqRows: snapshot.faqRows,
    completionResultRows: snapshot.completionResultRows,
    completionOutputRows: snapshot.completionOutputRows,
    completionFinalNoteRows: snapshot.completionFinalNoteRows,
  });
}

export function toNumOrZero(v: unknown) {
  const n = Number(cleanStr(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function splitLines(text: string) {
  return cleanStr(text)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function isCompletionStatus(status: ProjectStatus) {
  return status === "closed" || status === "completed";
}

export function formatDisplayValue(value: string, suffix?: string) {
  const cleanValue = cleanStr(value);
  if (!cleanValue) return "—";
  return suffix ? `${cleanValue} ${suffix}` : cleanValue;
}

export function parseAttachmentRows(rows: AttachmentRow[]) {
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

export function parseMilestoneRows(rows: MilestoneRow[]) {
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

export function parseFaqRows(rows: FaqRow[]) {
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

export function parseCompletionOutputRows(rows: CompletionOutputRow[]) {
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

export function buildCompletionContentPayload({
  overviewAr,
  summaryAr,
  resultsAr,
  outputRows,
  finalNotesAr,
  gallery,
}: {
  overviewAr: string;
  summaryAr: string;
  resultsAr: string[];
  outputRows: CompletionOutputRow[];
  finalNotesAr: string[];
  gallery: string[];
}): { value: CompletionContent | null; errors: string[] } {
  const normalizedOverview = cleanStr(overviewAr);
  const normalizedSummary = cleanStr(summaryAr);
  const normalizedResults = resultsAr.map((item) => cleanStr(item)).filter(Boolean);
  const normalizedFinalNotes = finalNotesAr.map((item) => cleanStr(item)).filter(Boolean);
  const normalizedGallery = gallery.map((item) => cleanStr(item)).filter(Boolean);
  const parsedOutputs = parseCompletionOutputRows(outputRows);

  if (parsedOutputs.errors.length > 0) {
    return { value: null, errors: parsedOutputs.errors };
  }

  const hasAnyValue =
    Boolean(normalizedOverview) ||
    Boolean(normalizedSummary) ||
    normalizedResults.length > 0 ||
    parsedOutputs.items.length > 0 ||
    normalizedFinalNotes.length > 0 ||
    normalizedGallery.length > 0;

  if (!hasAnyValue) {
    return { value: null, errors: [] };
  }

  return {
    value: {
      overviewAr: normalizedOverview,
      summaryAr: normalizedSummary,
      resultsAr: normalizedResults,
      outputs: parsedOutputs.items,
      finalNotesAr: normalizedFinalNotes,
      gallery: normalizedGallery,
    },
    errors: [],
  };
}

function isProgressSectionComplete(formData: FormDataState) {
  const hasValue = (value: unknown) => Boolean(cleanStr(value));
  const progressWeightsTotal =
    toNumOrZero(formData.progressFundingWeight) + toNumOrZero(formData.progressMilestonesWeight);

  return (
    formData.progressMode !== "hybrid" ||
    (hasValue(formData.progressFundingWeight) &&
      hasValue(formData.progressMilestonesWeight) &&
      progressWeightsTotal === 100)
  );
}

function isOptionsSectionComplete(formData: FormDataState) {
  const requiresVipTier =
    formData.isVip === "true" || formData.projectType === "vip_exclusive";

  return !requiresVipTier || formData.vipTier !== "none";
}

function isCompletionSectionComplete({
  formData,
  completionResultRows,
  completionOutputRows,
  completionFinalNoteRows,
  completionGalleryUrls,
}: Pick<
  BuildSectionStatusMapArgs,
  | "formData"
  | "completionResultRows"
  | "completionOutputRows"
  | "completionFinalNoteRows"
  | "completionGalleryUrls"
>) {
  const completionPayload = buildCompletionContentPayload({
    overviewAr: formData.completionOverviewAr,
    summaryAr: formData.completionSummaryAr,
    resultsAr: completionResultRows,
    outputRows: completionOutputRows,
    finalNotesAr: completionFinalNoteRows,
    gallery: completionGalleryUrls,
  });

  return (
    isCompletionStatus(formData.status) &&
    completionPayload.errors.length === 0 &&
    Boolean(completionPayload.value)
  );
}

export function isSectionComplete(
  sectionId: string,
  {
    formData,
    highlightRows,
    attachmentRows,
    milestoneRows,
    faqRows,
    completionResultRows,
    completionOutputRows,
    completionFinalNoteRows,
    completionGalleryUrls,
  }: BuildSectionStatusMapArgs
) {
  const hasValue = (value: unknown) => Boolean(cleanStr(value));

  switch (sectionId) {
    case "basic":
      return hasValue(formData.titleAr) && hasValue(formData.descriptionAr);
    case "details":
      return hasValue(formData.locationAr);
    case "media":
      return hasValue(formData.coverImage);
    case "highlights":
      return highlightRows.some((item) => hasValue(item));
    case "attachments": {
      const parsedAttachments = parseAttachmentRows(attachmentRows);
      return parsedAttachments.errors.length === 0 && parsedAttachments.items.length > 0;
    }
    case "milestones": {
      const parsedMilestones = parseMilestoneRows(milestoneRows);
      return parsedMilestones.errors.length === 0 && parsedMilestones.items.length > 0;
    }
    case "faq": {
      const parsedFaq = parseFaqRows(faqRows);
      return parsedFaq.errors.length === 0 && parsedFaq.items.length > 0;
    }
    case "completion": {
      return isCompletionSectionComplete({
        formData,
        completionResultRows,
        completionOutputRows,
        completionFinalNoteRows,
        completionGalleryUrls,
      });
    }
    case "finance":
      return [
        formData.targetAmount,
        formData.minInvestment,
        formData.annualReturn,
        formData.duration,
      ].every((value) => hasValue(value));
    case "progress":
      return isProgressSectionComplete(formData);
    case "options":
      return isOptionsSectionComplete(formData);
    case FINAL_SETTINGS_SECTION_ID:
      return (
        isProgressSectionComplete(formData) &&
        isOptionsSectionComplete(formData) &&
        isCompletionSectionComplete({
          formData,
          completionResultRows,
          completionOutputRows,
          completionFinalNoteRows,
          completionGalleryUrls,
        })
      );
    default:
      return false;
  }
}

export function buildSectionStatusMap({
  formData,
  highlightRows,
  attachmentRows,
  milestoneRows,
  faqRows,
  completionResultRows,
  completionOutputRows,
  completionFinalNoteRows,
  completionGalleryUrls,
}: BuildSectionStatusMapArgs): Record<string, SectionCompletionStatus> {
  return SECTION_DEFINITIONS.reduce<Record<string, SectionCompletionStatus>>((acc, section) => {
    acc[section.id] = isSectionComplete(section.id, {
      formData,
      highlightRows,
      attachmentRows,
      milestoneRows,
      faqRows,
      completionResultRows,
      completionOutputRows,
      completionFinalNoteRows,
      completionGalleryUrls,
    })
      ? "complete"
      : "incomplete";
    return acc;
  }, {});
}

export type CreateProjectUiProps = {
  activeSection: string;
  setActiveSection: StateSetter<string>;
  attachmentRows: AttachmentRow[];
  completionFinalNoteRows: string[];
  completionGalleryUploading: boolean;
  completionGalleryUrls: string[];
  completionOutputRows: CompletionOutputRow[];
  completionResultRows: string[];
  coverUploading: boolean;
  draftProjectId: string;
  faqRows: FaqRow[];
  filledCompletionFinalNotes: number;
  filledCompletionOutputs: number;
  filledCompletionResults: number;
  filledAttachments: number;
  filledFaq: number;
  filledHighlights: number;
  filledMilestones: number;
  formData: FormDataState;
  galleryUploading: boolean;
  galleryUrls: string[];
  handleAttachmentFileUpload: (index: number, file?: File | null) => Promise<void>;
  handleCompletionGalleryImageUpload: (files?: FileList | null) => Promise<void>;
  handleCoverImageUpload: (file?: File | null) => Promise<void>;
  handleGalleryImageUpload: (files?: FileList | null) => Promise<void>;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  hasUploadingAttachment: boolean;
  highlightRows: string[];
  isBusy: boolean;
  isDirty?: boolean;
  milestoneRows: MilestoneRow[];
  progressWeightsTotal: number;
  requiredChecklist: Array<{ label: string; ready: boolean }>;
  requiredReady: number;
  sectionMeta: Record<string, string>;
  sectionStatuses: Record<string, SectionCompletionStatus>;
  setAttachmentRows: StateSetter<AttachmentRow[]>;
  setCompletionFinalNoteRows: StateSetter<string[]>;
  setCompletionOutputRows: StateSetter<CompletionOutputRow[]>;
  setCompletionResultRows: StateSetter<string[]>;
  setFaqRows: StateSetter<FaqRow[]>;
  setFormData: StateSetter<FormDataState>;
  setHighlightRows: StateSetter<string[]>;
  setLocation: (path: string) => void;
  setMilestoneRows: StateSetter<MilestoneRow[]>;
  saving: boolean;
  totalAssets: number;
  backPath?: string;
  backLabel?: string;
  footerDescription?: ReactNode;
  footerTitle?: string;
  formId?: string;
  headerActions?: ReactNode;
  headerBadgeText?: string;
  headerContext?: ReactNode;
  headerDescription?: ReactNode;
  headerMetrics?: SummaryMetric[];
  headerTitle?: ReactNode;
  primaryActionLabel?: string;
  primaryActionLoadingLabel?: string;
  sidebarChecklistDescription?: ReactNode;
  sidebarChecklistTitle?: ReactNode;
  sidebarMetrics?: SummaryMetric[];
  sidebarTitle?: string;
  sidebarDescription?: string;
  workspaceIdLabel?: ReactNode;
  workspaceIdValue?: ReactNode;
};

export type ProjectEditorSnapshot = {
  formData: FormDataState;
  highlightRows: string[];
  attachmentRows: AttachmentRow[];
  milestoneRows: MilestoneRow[];
  faqRows: FaqRow[];
  completionResultRows: string[];
  completionOutputRows: CompletionOutputRow[];
  completionFinalNoteRows: string[];
};
