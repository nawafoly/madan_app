import type {
  ChangeEvent,
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
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

export type SectionConfig = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: LucideIconType;
};

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
  className?: string;
};

export const SECTION_DEFINITIONS: SectionConfig[] = [
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

export const projectTypeLabels: Record<ProjectType, string> = {
  sukuk: "استثمار بالصكوك",
  land_development: "تطوير أراضٍ",
  vip_exclusive: "VIP حصري",
};

export const statusLabels: Record<ProjectStatus, string> = {
  draft: "مسودة",
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

export function cleanStr(v: unknown) {
  return String(v ?? "").trim();
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

export type CreateProjectUiProps = {
  activeSection: string;
  setActiveSection: StateSetter<string>;
  attachmentRows: AttachmentRow[];
  coverUploading: boolean;
  draftProjectId: string;
  faqRows: FaqRow[];
  filledAttachments: number;
  filledFaq: number;
  filledHighlights: number;
  filledMilestones: number;
  formData: FormDataState;
  galleryUploading: boolean;
  galleryUrls: string[];
  handleAttachmentFileUpload: (index: number, file?: File | null) => Promise<void>;
  handleCoverImageUpload: (file?: File | null) => Promise<void>;
  handleGalleryImageUpload: (files?: FileList | null) => Promise<void>;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  hasUploadingAttachment: boolean;
  highlightRows: string[];
  isBusy: boolean;
  milestoneRows: MilestoneRow[];
  progressWeightsTotal: number;
  requiredChecklist: Array<{ label: string; ready: boolean }>;
  requiredReady: number;
  sectionMeta: Record<string, string>;
  setAttachmentRows: StateSetter<AttachmentRow[]>;
  setFaqRows: StateSetter<FaqRow[]>;
  setFormData: StateSetter<FormDataState>;
  setHighlightRows: StateSetter<string[]>;
  setLocation: (path: string) => void;
  setMilestoneRows: StateSetter<MilestoneRow[]>;
  saving: boolean;
  totalAssets: number;
};
