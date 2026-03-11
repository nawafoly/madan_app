// client/src/pages/admin/EditProject.tsx
import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/_core/firebase";
import { AUDIT_ACTIONS, auditedUpdateDoc, buildAuditSource } from "@/lib/auditLog";
import { buildR2DownloadUrl, uploadInvestmentDocument } from "@/lib/documentUploadService";

import DashboardLayout from "@/components/DashboardLayout";
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
import { ArrowRight, Save } from "lucide-react";

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
    if (typeof v?.toDate === "function") return v.toDate().toLocaleString("ar-SA");
    if (v instanceof Date) return v.toLocaleString("ar-SA");
    if (typeof v === "string" || typeof v === "number")
      return new Date(v).toLocaleString("ar-SA");
    return "—";
  } catch {
    return "—";
  }
}

// ✅ helper: يجعل صور public تشتغل لو كتبت اسم الملف فقط
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

export default function EditProject() {
  const [, params] = useRoute("/admin/projects/:id/edit");
  const [, setLocation] = useLocation();
  const projectId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [projectExists, setProjectExists] = useState(true);

  const [meta, setMeta] = useState<{ createdAt?: any; updatedAt?: any }>({});

  // ✅ Inputs كنصوص عشان ما تتكسر مع الكتابة
  const [formData, setFormData] = useState({
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
    galleryText: "", // روابط كل سطر (نحفظها في gallery)

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

    // ✅ NEW (progress control)
    progressMode: "hybrid" as ProgressMode,
    progressFundingWeight: "60",
    progressMilestonesWeight: "40",
  });

  const galleryUrls = useMemo(() => splitLines(formData.galleryText), [formData.galleryText]);
  const [highlightRows, setHighlightRows] = useState<string[]>([""]);
  const [attachmentRows, setAttachmentRows] = useState<AttachmentRow[]>([
    newAttachmentRow(),
  ]);
  const [milestoneRows, setMilestoneRows] = useState<MilestoneRow[]>([
    newMilestoneRow(),
  ]);
  const [faqRows, setFaqRows] = useState<FaqRow[]>([newFaqRow()]);
  const projectUploadId = projectId ? `project_${projectId}` : "";

  const handleAttachmentFileUpload = async (index: number, file?: File | null) => {
    if (!file || !projectId) return;

    try {
      setAttachmentRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, uploading: true } : row))
      );

      const uploaded = await uploadInvestmentDocument({
        investmentId: projectUploadId,
        file,
        kind: "attachment",
      });
      const downloadUrl = buildR2DownloadUrl(uploaded.path);
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
        investmentId: projectUploadId,
        file,
        kind: "attachment",
      });
      const downloadUrl = buildR2DownloadUrl(uploaded.path);
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
            investmentId: projectUploadId,
            file,
            kind: "attachment",
          });
          const downloadUrl = buildR2DownloadUrl(uploaded.path);
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

        // ✅ توافق مع القديم + الجديد:
        // - الجديد: gallery
        // - القديم: galleryImages
        const galleryArr: string[] = Array.isArray(p.gallery)
          ? p.gallery
          : Array.isArray(p.galleryImages)
          ? p.galleryImages
          : [];

        const highlightsArr: string[] = Array.isArray(p.highlights) ? p.highlights : [];

        const attachmentsArr: Attachment[] = Array.isArray(p.attachments) ? p.attachments : [];
        const milestonesArr: Milestone[] = Array.isArray(p.milestones) ? p.milestones : [];
        const faqArr: Faq[] = Array.isArray(p.faq) ? p.faq : [];

        setFormData({
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

          targetAmount: p.targetAmount != null ? String(p.targetAmount) : "",
          currentAmount: p.currentAmount != null ? String(p.currentAmount) : "",
          minInvestment: p.minInvestment != null ? String(p.minInvestment) : "",
          annualReturn: p.annualReturn != null ? String(p.annualReturn) : "",
          duration: p.duration != null ? String(p.duration) : "",
          investorsCount: p.investorsCount != null ? String(p.investorsCount) : "",

          featured: String(Boolean(p.featured)) as "true" | "false",
          isVip: String(Boolean(p.isVip)) as "true" | "false",
          vipTier: (p.vipTier ?? "none") as VipTier,

          // ✅ progress control
          progressMode: (p.progressMode ?? "hybrid") as ProgressMode,
          progressFundingWeight:
            p.progressFundingWeight != null ? String(p.progressFundingWeight) : "60",
          progressMilestonesWeight:
            p.progressMilestonesWeight != null ? String(p.progressMilestonesWeight) : "40",
        });
        setHighlightRows(highlightsArr.length ? highlightsArr : [""]);
        setAttachmentRows(attachmentRowsFromItems(attachmentsArr));
        setMilestoneRows(milestoneRowsFromItems(milestonesArr));
        setFaqRows(faqRowsFromItems(faqArr));
      } catch (err) {
        console.error(err);
        toast.error("فشل تحميل المشروع");
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
      toast.warning("انتظر حتى يكتمل رفع الصور.");
      return;
    }
    if (attachmentRows.some((row) => row.uploading)) {
      toast.warning("انتظر حتى يكتمل رفع المرفقات.");
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
        coverImage: cleanStr(formData.coverImage),
        // ✅ IMPORTANT: نحفظها باسم gallery (اللي ProjectDetails يقرأه)
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

        // ✅ NEW (for ProjectDetails)
        highlights: highlightsArr,
        attachments: parsedAttachments.items,
        milestones: parsedMilestones.items,
        faq: parsedFaq.items,

        // ✅ progress control (NEW)
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

      toast.success("تم تحديث المشروع بنجاح");
      setLocation("/admin/projects");
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
            <h1 className="text-3xl font-bold">تعديل المشروع</h1>
            <p className="text-muted-foreground">
              آخر تحديث: {safeDateLabel(meta.updatedAt)} • إنشاء: {safeDateLabel(meta.createdAt)}
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/admin/projects")}>
            <ArrowRight className="w-4 h-4 ml-2" />
            رجوع
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic */}
          <Card>
            <CardHeader>
              <CardTitle>المعلومات الأساسية</CardTitle>
              <CardDescription>العناوين والوصف</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">العنوان (عربي)</Label>
                  <Input
                    dir="rtl"
                    className="text-right"
                    value={formData.titleAr}
                    onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">العنوان (إنجليزي)</Label>
                  <Input
                    dir="ltr"
                    className="text-left"
                    value={formData.titleEn}
                    onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">الوصف (عربي)</Label>
                <Textarea
                  rows={4}
                  dir="rtl"
                  className="py-3 text-right leading-8"
                  value={formData.descriptionAr}
                  onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">الوصف (إنجليزي)</Label>
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
              <CardTitle>بيانات المشروع</CardTitle>
              <CardDescription>النوع، الحالة، رقم الإصدار، الموقع</CardDescription>
            </CardHeader>

            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">نوع المشروع</Label>
                <Select
                  value={formData.projectType}
                  onValueChange={(v) => setFormData({ ...formData, projectType: v as ProjectType })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sukuk">استثمار بالصكوك</SelectItem>
                    <SelectItem value="land_development">تطوير أراضي</SelectItem>
                    <SelectItem value="vip_exclusive">VIP حصري</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">الحالة</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as ProjectStatus })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue placeholder="اختر الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">قريبا</SelectItem>
                    <SelectItem value="published">منشور</SelectItem>
                    <SelectItem value="closed">مغلق</SelectItem>
                    <SelectItem value="completed">مكتمل</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">رقم الإصدار </Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  value={formData.issueNumber}
                  onChange={(e) => setFormData({ ...formData, issueNumber: e.target.value })}
                  placeholder="مثال: 2026-01"
                />
              </div>

              <div>
                <Label className="mb-2 block">الموقع (عربي)</Label>
                <Input
                  dir="rtl"
                  className="text-right"
                  value={formData.locationAr}
                  onChange={(e) => setFormData({ ...formData, locationAr: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <Label className="mb-2 block">الموقع (إنجليزي)</Label>
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
              <CardTitle>الصور</CardTitle>
              <CardDescription>صورة الغلاف + معرض الصور (كل سطر)</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4 items-start">
                <div className="space-y-2">
                  <Label>صورة الغلاف</Label>
                  <Input
                    value={formData.coverImage}
                    onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                    placeholder="مثال: HOOM-HERO.png أو /HOOM-HERO.png أو https://..."
                  />
                  <p className="text-xs text-muted-foreground">
                    إذا الصورة داخل public اكتب اسم الملف أو ابدأ بـ /
                  </p>
                  <Label className="mt-2 block">أو إرفاق صورة غلاف</Label>
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
                    <p className="text-xs text-muted-foreground">جاري رفع صورة الغلاف...</p>
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
                    <div className="text-sm text-muted-foreground">لا توجد صورة غلاف</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>معرض الصور (gallery) — كل رابط/اسم ملف في سطر</Label>
                <Textarea
                  rows={6}
                  value={formData.galleryText}
                  onChange={(e) => setFormData({ ...formData, galleryText: e.target.value })}
                  placeholder={`HOOM-HERO.png\n/bg-01-l.png\nhttps://...`}
                />
                <Label className="mt-2 block">أو إرفاق صور للمعرض</Label>
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
                  <p className="text-xs text-muted-foreground">جاري رفع صور المعرض...</p>
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
              <CardTitle>مميزات المشروع</CardTitle>
              <CardDescription>كل ميزة في خانة مستقلة</CardDescription>
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
                    placeholder={`الميزة ${idx + 1}`}
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
                    حذف
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setHighlightRows((prev) => [...prev, ""])}
              >
                إضافة ميزة
              </Button>
              <p className="text-xs text-muted-foreground">
                ProjectDetails بيعرضها تلقائي إذا فيه عناصر.
              </p>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle>مرفقات</CardTitle>
              <CardDescription>كل مرفق في صف: الاسم + ملف مرفوع + رابط خارجي</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {attachmentRows.map((row, idx) => (
                <div key={`attachment-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>الاسم</Label>
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
                        placeholder={`اسم المرفق ${idx + 1}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>رابط خارجي (اختياري)</Label>
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
                      <Label>إرفاق ملف</Label>
                      <Input
                        type="file"
                        onChange={(e) => handleAttachmentFileUpload(idx, e.target.files?.[0] ?? null)}
                        disabled={row.uploading}
                      />
                      {row.uploading ? (
                        <p className="text-xs text-muted-foreground">جاري رفع الملف...</p>
                      ) : row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline break-all"
                        >
                          عرض الملف المرفوع
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground">لم يتم رفع ملف بعد.</p>
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
                      مسح الملف
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
                      حذف المرفق
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setAttachmentRows((prev) => [...prev, newAttachmentRow()])}
              >
                إضافة مرفق
              </Button>
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader>
              <CardTitle>المراحل</CardTitle>
              <CardDescription>كل مرحلة في صف مستقل: عنوان + تاريخ + حالة + وصف</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestoneRows.map((row, idx) => (
                <div key={`milestone-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>العنوان</Label>
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
                        placeholder={`عنوان المرحلة ${idx + 1}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>التاريخ</Label>
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
                      <Label>الحالة</Label>
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
                        placeholder="قيد التنفيذ"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>الوصف</Label>
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
                        placeholder="وصف مختصر للمرحلة"
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
                      حذف المرحلة
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setMilestoneRows((prev) => [...prev, newMilestoneRow()])}
              >
                إضافة مرحلة
              </Button>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle>الأسئلة الشائعة (faq)</CardTitle>
              <CardDescription>كل سؤال في صف مستقل: سؤال + جواب</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {faqRows.map((row, idx) => (
                <div key={`faq-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div className="space-y-1">
                    <Label>السؤال</Label>
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
                      placeholder={`السؤال ${idx + 1}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>الجواب</Label>
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
                      placeholder="اكتب الجواب"
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
                      حذف السؤال
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setFaqRows((prev) => [...prev, newFaqRow()])}
              >
                إضافة سؤال
              </Button>
            </CardContent>
          </Card>

          {/* Finance */}
          <Card>
            <CardHeader>
              <CardTitle>البيانات المالية</CardTitle>
              <CardDescription>أرقام الاستثمار والتقدم</CardDescription>
            </CardHeader>

            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">المبلغ المستهدف </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">المبلغ الحالي</Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.currentAmount}
                  onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">الحد الأدنى</Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.minInvestment}
                  onChange={(e) => setFormData({ ...formData, minInvestment: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">العائد السنوي % </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.annualReturn}
                  onChange={(e) => setFormData({ ...formData, annualReturn: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">المدة بالشهور </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">عدد المستثمرين </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={formData.investorsCount}
                  onChange={(e) => setFormData({ ...formData, investorsCount: e.target.value })}
                />
              </div>

              <div className="md:col-span-3 text-sm text-muted-foreground">
                التقدم التقريبي (تمويل فقط):{" "}
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

          {/* ✅ Progress control */}
          <Card>
            <CardHeader>
              <CardTitle>مصدر التقدم</CardTitle>
              <CardDescription>اختر كيف نحسب التقدم في صفحة تفاصيل المشروع</CardDescription>
            </CardHeader>

            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">طريقة الحساب</Label>
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
                    <SelectItem value="funding">حسب التمويل فقط</SelectItem>
                    <SelectItem value="milestones">حسب المراحل فقط</SelectItem>
                    <SelectItem value="hybrid">هجين (تمويل + مراحل)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.progressMode === "hybrid" && (
                <>
                  <div>
                    <Label className="mb-2 block">معدل التمويل (%)</Label>
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
                    <Label className="mb-2 block">معدل المراحل (%)</Label>
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
                    إذا مجموع الأوزان ليس 100، النظام يطبّعها تلقائياً أثناء الحساب.
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Flags */}
          <Card>
            <CardHeader>
              <CardTitle>خيارات إضافية</CardTitle>
              <CardDescription>تمييز المشروع وVIP</CardDescription>
            </CardHeader>

            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">مميز (featured)</Label>
                <Select
                  value={formData.featured}
                  onValueChange={(v) => setFormData({ ...formData, featured: v as "true" | "false" })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">لا</SelectItem>
                    <SelectItem value="true">نعم</SelectItem>
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
                    <SelectItem value="false">لا</SelectItem>
                    <SelectItem value="true">نعم</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">مستوى VIP (vipTier)</Label>
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
              disabled={saving || coverUploading || galleryUploading}
            >
              إلغاء
            </Button>

            <Button
              type="submit"
              disabled={saving || coverUploading || galleryUploading}
              className="bg-[#F2B705] hover:bg-[#d9a504]"
            >
              <Save className="w-4 h-4 ml-2" />
              {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
