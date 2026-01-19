// client/src/pages/admin/EditProject.tsx
import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";

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

type Attachment = { name?: string; url?: string };
type Milestone = { title?: string; date?: string; status?: string; description?: string };
type Faq = { q?: string; a?: string };

function parseJsonArray<T>(text: string): T[] {
  const raw = cleanStr(text);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export default function EditProject() {
  const [, params] = useRoute("/admin/projects/:id/edit");
  const [, setLocation] = useLocation();
  const projectId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

    // ✅ NEW (for ProjectDetails)
    highlightsText: "",   // كل سطر = ميزة
    attachmentsJson: "",  // JSON array
    milestonesJson: "",   // JSON array
    faqJson: "",          // JSON array

    // ✅ NEW (progress control)
    progressMode: "hybrid" as ProgressMode,
    progressFundingWeight: "60",
    progressMilestonesWeight: "40",
  });

  const galleryUrls = useMemo(() => splitLines(formData.galleryText), [formData.galleryText]);

  const highlightsArr = useMemo(() => splitLines(formData.highlightsText), [formData.highlightsText]);

  const attachmentsArr = useMemo(
    () => parseJsonArray<Attachment>(formData.attachmentsJson),
    [formData.attachmentsJson]
  );

  const milestonesArr = useMemo(
    () => parseJsonArray<Milestone>(formData.milestonesJson),
    [formData.milestonesJson]
  );

  const faqArr = useMemo(
    () => parseJsonArray<Faq>(formData.faqJson),
    [formData.faqJson]
  );

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

          // ✅ NEW
          highlightsText: highlightsArr.join("\n"),
          attachmentsJson: attachmentsArr.length ? JSON.stringify(attachmentsArr, null, 2) : "",
          milestonesJson: milestonesArr.length ? JSON.stringify(milestonesArr, null, 2) : "",
          faqJson: faqArr.length ? JSON.stringify(faqArr, null, 2) : "",

          // ✅ progress control
          progressMode: (p.progressMode ?? "hybrid") as ProgressMode,
          progressFundingWeight:
            p.progressFundingWeight != null ? String(p.progressFundingWeight) : "60",
          progressMilestonesWeight:
            p.progressMilestonesWeight != null ? String(p.progressMilestonesWeight) : "40",
        });
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

    // ✅ تحقق JSON قبل الحفظ (عشان ما تحفظ نص مكسر)
    const validateJson = (label: string, text: string) => {
      const t = cleanStr(text);
      if (!t) return true;
      try {
        const parsed = JSON.parse(t);
        if (!Array.isArray(parsed)) throw new Error("not array");
        return true;
      } catch {
        toast.error(`${label}: لازم يكون JSON Array صحيح`);
        return false;
      }
    };

    if (!validateJson("Attachments", formData.attachmentsJson)) return;
    if (!validateJson("Milestones", formData.milestonesJson)) return;
    if (!validateJson("FAQ", formData.faqJson)) return;

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
        currentAmount: toNumOrZero(formData.currentAmount),
        minInvestment: toNumOrZero(formData.minInvestment),
        annualReturn: toNumOrZero(formData.annualReturn),
        duration: toNumOrZero(formData.duration),
        investorsCount: toNumOrZero(formData.investorsCount),

        // flags
        featured: formData.featured === "true",
        isVip: formData.isVip === "true",
        vipTier: formData.vipTier,

        // ✅ NEW (for ProjectDetails)
        highlights: highlightsArr,
        attachments: parseJsonArray<Attachment>(formData.attachmentsJson),
        milestones: parseJsonArray<Milestone>(formData.milestonesJson),
        faq: parseJsonArray<Faq>(formData.faqJson),

        // ✅ progress control (NEW)
        progressMode: formData.progressMode,
        progressFundingWeight: toNumOrZero(formData.progressFundingWeight),
        progressMilestonesWeight: toNumOrZero(formData.progressMilestonesWeight),

        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "projects", projectId), payload);

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
                  <Label>العنوان (عربي)</Label>
                  <Input
                    value={formData.titleAr}
                    onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                  />
                </div>
                <div>
                  <Label>العنوان (إنجليزي)</Label>
                  <Input
                    value={formData.titleEn}
                    onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>الوصف (عربي)</Label>
                <Textarea
                  rows={4}
                  value={formData.descriptionAr}
                  onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                />
              </div>

              <div>
                <Label>الوصف (إنجليزي)</Label>
                <Textarea
                  rows={4}
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
                <Label>نوع المشروع</Label>
                <Select
                  value={formData.projectType}
                  onValueChange={(v) => setFormData({ ...formData, projectType: v as ProjectType })}
                >
                  <SelectTrigger>
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
                <Label>الحالة</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as ProjectStatus })}
                >
                  <SelectTrigger>
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
                <Label>رقم الإصدار </Label>
                <Input
                  value={formData.issueNumber}
                  onChange={(e) => setFormData({ ...formData, issueNumber: e.target.value })}
                  placeholder="مثال: 2026-01"
                />
              </div>

              <div>
                <Label>الموقع (عربي)</Label>
                <Input
                  value={formData.locationAr}
                  onChange={(e) => setFormData({ ...formData, locationAr: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <Label>الموقع (إنجليزي)</Label>
                <Input
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
              <CardDescription>كل ميزة في سطر</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={6}
                value={formData.highlightsText}
                onChange={(e) => setFormData({ ...formData, highlightsText: e.target.value })}
                placeholder={`موقع استراتيجي\nعائد سنوي مستهدف\nإدارة احترافية`}
              />
              <p className="text-xs text-muted-foreground">
                ProjectDetails بيعرضها تلقائي إذا فيه عناصر.
              </p>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle>مرفقات</CardTitle>
              <CardDescription>اكتب JSON Array (نسخ/لصق)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={8}
                value={formData.attachmentsJson}
                onChange={(e) => setFormData({ ...formData, attachmentsJson: e.target.value })}
                placeholder={`[
  { "name": "دراسة الجدوى", "url": "https://example.com/file.pdf" },
  { "name": "النشرة", "url": "https://example.com/brochure.pdf" }
]`}
              />
              <p className="text-xs text-muted-foreground">
                لازم يكون JSON صحيح ومصفوفة.
              </p>
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader>
              <CardTitle>المراحل</CardTitle>
              <CardDescription>JSON Array</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={10}
                value={formData.milestonesJson}
                onChange={(e) => setFormData({ ...formData, milestonesJson: e.target.value })}
                placeholder={`[
  { "title": "التصميم", "date": "2026-02", "status": "قيد التنفيذ", "description": "..." },
  { "title": "بدء التنفيذ", "date": "2026-04", "status": "قريباً" }
]`}
              />
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle>الأسئلة الشائعة (faq)</CardTitle>
              <CardDescription>JSON Array</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={10}
                value={formData.faqJson}
                onChange={(e) => setFormData({ ...formData, faqJson: e.target.value })}
                placeholder={`[
  { "q": "كيف الاستثمار؟", "a": "تسجل حساب ثم تختار المبلغ وتقدّم الطلب." },
  { "q": "هل متوافق مع الشريعة؟", "a": "نعم وفق ضوابط محددة." }
]`}
              />
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
                <Label>المبلغ المستهدف </Label>
                <Input
                  inputMode="numeric"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                />
              </div>

              <div>
                <Label>المبلغ الحالي</Label>
                <Input
                  inputMode="numeric"
                  value={formData.currentAmount}
                  onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
                />
              </div>

              <div>
                <Label>الحد الأدنى</Label>
                <Input
                  inputMode="numeric"
                  value={formData.minInvestment}
                  onChange={(e) => setFormData({ ...formData, minInvestment: e.target.value })}
                />
              </div>

              <div>
                <Label>العائد السنوي % </Label>
                <Input
                  inputMode="numeric"
                  value={formData.annualReturn}
                  onChange={(e) => setFormData({ ...formData, annualReturn: e.target.value })}
                />
              </div>

              <div>
                <Label>المدة بالشهور </Label>
                <Input
                  inputMode="numeric"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                />
              </div>

              <div>
                <Label>عدد المستثمرين </Label>
                <Input
                  inputMode="numeric"
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
                <Label>طريقة الحساب</Label>
                <Select
                  value={formData.progressMode}
                  onValueChange={(v) =>
                    setFormData({ ...formData, progressMode: v as ProgressMode })
                  }
                >
                  <SelectTrigger>
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
                    <Label>معدل التمويل (%)</Label>
                    <Input
                      inputMode="numeric"
                      value={formData.progressFundingWeight}
                      onChange={(e) =>
                        setFormData({ ...formData, progressFundingWeight: e.target.value })
                      }
                      placeholder="60"
                    />
                  </div>

                  <div>
                    <Label>معدل المراحل (%)</Label>
                    <Input
                      inputMode="numeric"
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
                <Label>مميز (featured)</Label>
                <Select
                  value={formData.featured}
                  onValueChange={(v) => setFormData({ ...formData, featured: v as "true" | "false" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">لا</SelectItem>
                    <SelectItem value="true">نعم</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>VIP (isVip)</Label>
                <Select
                  value={formData.isVip}
                  onValueChange={(v) => setFormData({ ...formData, isVip: v as "true" | "false" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">لا</SelectItem>
                    <SelectItem value="true">نعم</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>مستوى VIP (vipTier)</Label>
                <Select
                  value={formData.vipTier}
                  onValueChange={(v) => setFormData({ ...formData, vipTier: v as VipTier })}
                >
                  <SelectTrigger>
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
              disabled={saving}
            >
              إلغاء
            </Button>

            <Button type="submit" disabled={saving} className="bg-[#F2B705] hover:bg-[#d9a504]">
              <Save className="w-4 h-4 ml-2" />
              {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
