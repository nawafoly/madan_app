import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { collection, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import { AUDIT_ACTIONS, auditedSetDoc, buildAuditSource } from "@/lib/auditLog";
import { buildR2DownloadUrl, uploadInvestmentDocument } from "@/lib/documentUploadService";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Attachment = { name?: string; url?: string; externalUrl?: string };
type Milestone = { title?: string; date?: string; status?: string; description?: string };
type Faq = { q?: string; a?: string };
type AttachmentRow = { name: string; url: string; externalUrl: string; uploading?: boolean };
type MilestoneRow = { title: string; date: string; status: string; description: string };
type FaqRow = { q: string; a: string };

const newAttachmentRow = (): AttachmentRow => ({ name: "", url: "", externalUrl: "" });
const newMilestoneRow = (): MilestoneRow => ({ title: "", date: "", status: "", description: "" });
const newFaqRow = (): FaqRow => ({ q: "", a: "" });

function cleanStr(v: any) {
  return String(v ?? "").trim();
}
function toNumOrZero(v: any) {
  const n = Number(cleanStr(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function splitLines(text: string) {
  return cleanStr(text)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseAttachmentRows(rows: AttachmentRow[]) {
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

function parseMilestoneRows(rows: MilestoneRow[]) {
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
    items.push({ title, ...(date ? { date } : {}), ...(status ? { status } : {}), ...(description ? { description } : {}) });
  });
  return { items, errors };
}

function parseFaqRows(rows: FaqRow[]) {
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

export default function CreateProject() {
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);
  const [draftProjectId] = useState(() => doc(collection(db, "projects")).id);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);

  const [formData, setFormData] = useState({
    titleAr: "",
    titleEn: "",
    descriptionAr: "",
    descriptionEn: "",
    projectType: "sukuk" as ProjectType,
    status: "draft" as ProjectStatus,
    issueNumber: `MAE-${Date.now().toString().slice(-6)}`,
    locationAr: "",
    locationEn: "",
    coverImage: "",
    galleryText: "",
    targetAmount: "",
    currentAmount: "0",
    minInvestment: "",
    annualReturn: "",
    duration: "",
    investorsCount: "0",
    progressMode: "hybrid" as ProgressMode,
    progressFundingWeight: "60",
    progressMilestonesWeight: "40",
    featured: "false" as "true" | "false",
    isVip: "false" as "true" | "false",
    vipTier: "none" as VipTier,
  });

  const [highlightRows, setHighlightRows] = useState<string[]>([""]);
  const [attachmentRows, setAttachmentRows] = useState<AttachmentRow[]>([newAttachmentRow()]);
  const [milestoneRows, setMilestoneRows] = useState<MilestoneRow[]>([newMilestoneRow()]);
  const [faqRows, setFaqRows] = useState<FaqRow[]>([newFaqRow()]);
  const galleryUrls = useMemo(() => splitLines(formData.galleryText), [formData.galleryText]);
  const projectUploadId = `project_${draftProjectId}`;

  const handleAttachmentFileUpload = async (index: number, file?: File | null) => {
    if (!file) return;
    try {
      setAttachmentRows((prev) => prev.map((r, i) => (i === index ? { ...r, uploading: true } : r)));
      const uploaded = await uploadInvestmentDocument({
        investmentId: projectUploadId,
        file,
        kind: "attachment",
      });
      const url = buildR2DownloadUrl(uploaded.path);
      if (!url) throw new Error("Upload failed");
      setAttachmentRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, uploading: false, url, name: r.name || file.name } : r))
      );
      toast.success("تم رفع الملف بنجاح");
    } catch (e) {
      console.error(e);
      setAttachmentRows((prev) => prev.map((r, i) => (i === index ? { ...r, uploading: false } : r)));
      toast.error("فشل رفع الملف");
    }
  };

  const handleCoverImageUpload = async (file?: File | null) => {
    if (!file) return;
    try {
      setCoverUploading(true);
      const uploaded = await uploadInvestmentDocument({
        investmentId: projectUploadId,
        file,
        kind: "attachment",
      });
      const url = buildR2DownloadUrl(uploaded.path);
      if (!url) throw new Error("Upload failed");
      setFormData((prev) => ({ ...prev, coverImage: url }));
      toast.success("تم رفع صورة الغلاف بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("فشل رفع صورة الغلاف");
    } finally {
      setCoverUploading(false);
    }
  };

  const handleGalleryImageUpload = async (files?: FileList | null) => {
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
          const url = buildR2DownloadUrl(uploaded.path);
          if (!url) throw new Error("Upload failed");
          return url;
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!cleanStr(formData.titleAr)) return toast.error("عنوان المشروع (عربي) مطلوب");
    if (!cleanStr(formData.descriptionAr)) return toast.error("الوصف (عربي) مطلوب");
    if (!cleanStr(formData.locationAr)) return toast.error("الموقع (عربي) مطلوب");
    if (!cleanStr(formData.coverImage)) return toast.error("صورة الغلاف مطلوبة");
    if (attachmentRows.some((r) => r.uploading)) return toast.warning("انتظر حتى يكتمل رفع المرفقات.");

    if (coverUploading || galleryUploading) return toast.warning("انتظر حتى يكتمل رفع الصور.");

    const parsedAttachments = parseAttachmentRows(attachmentRows);
    if (parsedAttachments.errors.length) return toast.error(`المرفقات: ${parsedAttachments.errors[0]}`);
    const parsedMilestones = parseMilestoneRows(milestoneRows);
    if (parsedMilestones.errors.length) return toast.error(`المراحل: ${parsedMilestones.errors[0]}`);
    const parsedFaq = parseFaqRows(faqRows);
    if (parsedFaq.errors.length) return toast.error(`الأسئلة الشائعة: ${parsedFaq.errors[0]}`);

    const titleAr = cleanStr(formData.titleAr);
    const titleEn = cleanStr(formData.titleEn);
    const descAr = cleanStr(formData.descriptionAr);
    const descEn = cleanStr(formData.descriptionEn);
    const locAr = cleanStr(formData.locationAr);
    const locEn = cleanStr(formData.locationEn);
    const issueNumber = cleanStr(formData.issueNumber) || `MAE-${Date.now().toString().slice(-6)}`;
    const isVip = formData.isVip === "true" || formData.projectType === "vip_exclusive";

    try {
      setSaving(true);
      const projectRef = doc(db, "projects", draftProjectId);
      const payload = {
        issueNumber,
        titleAr,
        titleEn,
        title: titleEn || titleAr,
        descriptionAr: descAr,
        descriptionEn: descEn,
        description: descEn || descAr,
        overviewAr: descAr,
        projectType: formData.projectType,
        status: formData.status,
        locationAr: locAr,
        locationEn: locEn,
        location: locEn || locAr,
        coverImage: cleanStr(formData.coverImage),
        gallery: galleryUrls,
        images: galleryUrls,
        highlights: highlightRows.map((x) => cleanStr(x)).filter(Boolean),
        attachments: parsedAttachments.items,
        milestones: parsedMilestones.items,
        faq: parsedFaq.items,
        targetAmount: toNumOrZero(formData.targetAmount),
        currentAmount: toNumOrZero(formData.currentAmount),
        minInvestment: toNumOrZero(formData.minInvestment),
        annualReturn: toNumOrZero(formData.annualReturn),
        investmentReturn: toNumOrZero(formData.annualReturn),
        duration: toNumOrZero(formData.duration),
        investorsCount: toNumOrZero(formData.investorsCount),
        progressMode: formData.progressMode,
        progressFundingWeight: toNumOrZero(formData.progressFundingWeight),
        progressMilestonesWeight: toNumOrZero(formData.progressMilestonesWeight),
        featured: formData.featured === "true",
        isVip,
        vipOnly: isVip,
        vipTier: formData.vipTier,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await auditedSetDoc({
        ref: projectRef,
        data: payload,
        action: AUDIT_ACTIONS.PROJECT_CREATED,
        category: "project",
        entityType: "project",
        source: buildAuditSource({
          area: "admin",
          page: "CreateProject",
          method: "create",
        }),
        relatedIds: { projectId: draftProjectId },
        message: `Created project ${titleAr || titleEn || draftProjectId}`,
        meta: {
          projectName: titleAr || titleEn || draftProjectId,
          issueNumber,
          status: formData.status,
          projectType: formData.projectType,
        },
        ignoreFields: ["updatedAt"],
      });
      toast.success("تم إنشاء المشروع بنجاح");
      setLocation("/admin/projects");
    } catch (e) {
      console.error(e);
      toast.error("فشل إنشاء المشروع");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">إنشاء مشروع جديد</h1>
          <Button variant="outline" onClick={() => setLocation("/admin/projects")}>
            <ArrowRight className="w-4 h-4 ml-2" />
            رجوع
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>المعلومات الأساسية</CardTitle>
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
                  className="text-right leading-7"
                  value={formData.descriptionAr}
                  onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                />
              </div>

              <div>
                <Label className="mb-2 block">الوصف (إنجليزي)</Label>
                <Textarea
                  rows={4}
                  dir="ltr"
                  className="text-left leading-7"
                  value={formData.descriptionEn}
                  onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>بيانات المشروع</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">نوع المشروع</Label>
                <Select
                  value={formData.projectType}
                  onValueChange={(v) => setFormData({ ...formData, projectType: v as ProjectType })}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue />
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
                    <SelectValue />
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
                <Label className="mb-2 block">رقم الإصدار</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  value={formData.issueNumber}
                  onChange={(e) => setFormData({ ...formData, issueNumber: e.target.value })}
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

          <Card>
            <CardHeader>
              <CardTitle>الصور</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">صورة الغلاف</Label>
                <Input
                  value={formData.coverImage}
                  onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                  placeholder="project-cover.png أو /project-cover.png أو https://..."
                />
                <Label className="mb-2 mt-3 block">أو إرفاق صورة غلاف</Label>
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
                  <p className="text-xs text-muted-foreground mt-1">جاري رفع صورة الغلاف...</p>
                ) : null}
              </div>
              <div>
                <Label className="mb-2 block">معرض الصور (كل رابط في سطر)</Label>
                <Textarea
                  rows={5}
                  value={formData.galleryText}
                  onChange={(e) => setFormData({ ...formData, galleryText: e.target.value })}
                  placeholder={"image-1.png\n/image-2.png\nhttps://..."}
                />
                <Label className="mb-2 mt-3 block">أو إرفاق صور للمعرض</Label>
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
                  <p className="text-xs text-muted-foreground mt-1">جاري رفع صور المعرض...</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>مميزات المشروع</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {highlightRows.map((row, idx) => (
                <div key={`highlight-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <Input
                    dir="rtl"
                    className="text-right"
                    value={row}
                    onChange={(e) =>
                      setHighlightRows((prev) =>
                        prev.map((item, i) => (i === idx ? e.target.value : item))
                      )
                    }
                    placeholder={`الميزة ${idx + 1}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={highlightRows.length === 1}
                    onClick={() =>
                      setHighlightRows((prev) =>
                        prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                      )
                    }
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>مرفقات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {attachmentRows.map((row, idx) => (
                <div key={`attachment-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-2 block">الاسم</Label>
                      <Input
                        dir="rtl"
                        className="text-right"
                        value={row.name}
                        onChange={(e) =>
                          setAttachmentRows((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                          )
                        }
                        placeholder={`اسم المرفق ${idx + 1}`}
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block">الرابط الخارجي (اختياري)</Label>
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

                  <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <Label className="mb-2 block">إرفاق ملف</Label>
                      <Input
                        type="file"
                        disabled={row.uploading}
                        onChange={(e) => handleAttachmentFileUpload(idx, e.target.files?.[0] ?? null)}
                      />
                      {row.uploading ? (
                        <p className="text-xs text-muted-foreground mt-1">جاري رفع الملف...</p>
                      ) : row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline break-all mt-1 inline-block"
                        >
                          عرض الملف المرفوع
                        </a>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!row.url || row.uploading}
                      onClick={() =>
                        setAttachmentRows((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, url: "" } : item))
                        )
                      }
                    >
                      مسح الملف
                    </Button>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={attachmentRows.length === 1}
                      onClick={() =>
                        setAttachmentRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                        )
                      }
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

          <Card>
            <CardHeader>
              <CardTitle>المراحل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestoneRows.map((row, idx) => (
                <div key={`milestone-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-2 block">العنوان</Label>
                      <Input
                        dir="rtl"
                        className="text-right"
                        value={row.title}
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item))
                          )
                        }
                        placeholder={`عنوان المرحلة ${idx + 1}`}
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block">التاريخ</Label>
                      <Input
                        dir="ltr"
                        className="text-left"
                        value={row.date}
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, date: e.target.value } : item))
                          )
                        }
                        placeholder="2026-02"
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block">الحالة</Label>
                      <Input
                        dir="rtl"
                        className="text-right"
                        value={row.status}
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, status: e.target.value } : item))
                          )
                        }
                        placeholder="قيد التنفيذ"
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block">الوصف</Label>
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
                        placeholder="وصف مختصر"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={milestoneRows.length === 1}
                      onClick={() =>
                        setMilestoneRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                        )
                      }
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

          <Card>
            <CardHeader>
              <CardTitle>الأسئلة الشائعة (faq)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {faqRows.map((row, idx) => (
                <div key={`faq-${idx}`} className="rounded-md border p-3 space-y-3">
                  <div>
                    <Label className="mb-2 block">السؤال</Label>
                    <Input
                      dir="rtl"
                      className="text-right"
                      value={row.q}
                      onChange={(e) =>
                        setFaqRows((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, q: e.target.value } : item))
                        )
                      }
                      placeholder={`السؤال ${idx + 1}`}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">الجواب</Label>
                    <Textarea
                      rows={2}
                      dir="rtl"
                      className="text-right"
                      value={row.a}
                      onChange={(e) =>
                        setFaqRows((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, a: e.target.value } : item))
                        )
                      }
                      placeholder="اكتب الجواب"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={faqRows.length === 1}
                      onClick={() =>
                        setFaqRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                        )
                      }
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

          <Card>
            <CardHeader>
              <CardTitle>البيانات المالية</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">المبلغ المستهدف</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  inputMode="numeric"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">المبلغ الحالي</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  inputMode="numeric"
                  value={formData.currentAmount}
                  onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">الحد الأدنى</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  inputMode="numeric"
                  value={formData.minInvestment}
                  onChange={(e) => setFormData({ ...formData, minInvestment: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">العائد السنوي %</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  inputMode="numeric"
                  value={formData.annualReturn}
                  onChange={(e) => setFormData({ ...formData, annualReturn: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">المدة بالشهور</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  inputMode="numeric"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">عدد المستثمرين</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  inputMode="numeric"
                  value={formData.investorsCount}
                  onChange={(e) => setFormData({ ...formData, investorsCount: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>مصدر التقدم</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">طريقة الحساب</Label>
                <Select
                  value={formData.progressMode}
                  onValueChange={(v) => setFormData({ ...formData, progressMode: v as ProgressMode })}
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

              {formData.progressMode === "hybrid" ? (
                <>
                  <div>
                    <Label className="mb-2 block">معدل التمويل (%)</Label>
                    <Input
                      dir="ltr"
                      className="text-left"
                      inputMode="numeric"
                      value={formData.progressFundingWeight}
                      onChange={(e) =>
                        setFormData({ ...formData, progressFundingWeight: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">معدل المراحل (%)</Label>
                    <Input
                      dir="ltr"
                      className="text-left"
                      inputMode="numeric"
                      value={formData.progressMilestonesWeight}
                      onChange={(e) =>
                        setFormData({ ...formData, progressMilestonesWeight: e.target.value })
                      }
                    />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>خيارات إضافية</CardTitle>
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

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving || coverUploading || galleryUploading}
              onClick={() => setLocation("/admin/projects")}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={saving || coverUploading || galleryUploading}
              className="bg-[#F2B705] hover:bg-[#d9a504]"
            >
              <Save className="w-4 h-4 ml-2" />
              {saving ? "جاري الإنشاء..." : "إنشاء المشروع"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
