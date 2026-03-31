import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Crown,
  FileImage,
  FolderKanban,
  Gauge,
  ImagePlus,
  Landmark,
  ListChecks,
  MapPinned,
  Paperclip,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import type { CreateProjectUiProps } from "./shared";
import {
  SECTION_DEFINITIONS,
  cleanStr,
  formatDisplayValue,
  inputClassName,
  progressModeLabels,
  progressModeNarratives,
  projectTypeLabels,
  selectTriggerClassName,
  statusLabels,
  textareaClassName,
  vipTierLabels,
} from "./shared";
import { Field, MetricCard, SectionCard, UploadDropzone } from "./ui-primitives";

export function CreateProjectUi({
  activeSection,
  setActiveSection,
  attachmentRows,
  coverUploading,
  draftProjectId,
  faqRows,
  filledAttachments,
  filledFaq,
  filledHighlights,
  filledMilestones,
  formData,
  galleryUploading,
  galleryUrls,
  handleAttachmentFileUpload,
  handleCoverImageUpload,
  handleGalleryImageUpload,
  handleSubmit,
  hasUploadingAttachment,
  highlightRows,
  isBusy,
  milestoneRows,
  progressWeightsTotal,
  requiredChecklist,
  requiredReady,
  sectionMeta,
  setAttachmentRows,
  setFaqRows,
  setFormData,
  setHighlightRows,
  setLocation,
  setMilestoneRows,
  saving,
  totalAssets,
}: CreateProjectUiProps) {
  return (
    <div className="relative space-y-6 pb-28" dir="rtl">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] rounded-[42px] bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.18),transparent_30%),radial-gradient(circle_at_top_left,rgba(11,23,38,0.14),transparent_34%),linear-gradient(180deg,rgba(248,250,252,0.8),transparent)] blur-3xl" />

      <header className="overflow-hidden rounded-[34px] border border-slate-200/80 bg-[linear-gradient(135deg,#0b1726_0%,#12233a_55%,#1c2f49_100%)] text-white shadow-[0_32px_90px_-40px_rgba(11,23,38,0.75)]">
        <div className="relative px-6 py-7 md:px-8 md:py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(242,174,48,0.14),transparent_24%)]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <Badge className="w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                Project Creation
              </Badge>

              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  إنشاء مشروع جديد
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                  إعداد مشروع استثماري جديد بهوية أوضح، وهيكل أقسام منظم، وتجربة إدخال
                  أقرب لمنصات التمويل والاستثمار الاحترافية.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  icon={Target}
                  label="الجاهزية الأساسية"
                  value={`${requiredReady}/4 عناصر`}
                  tone="dark"
                />
                <MetricCard
                  icon={FolderKanban}
                  label="تصنيف المشروع"
                  value={projectTypeLabels[formData.projectType]}
                  tone="dark"
                />
                <MetricCard
                  icon={FileImage}
                  label="الأصول"
                  value={`${totalAssets} عناصر`}
                  tone="dark"
                />
                <MetricCard
                  icon={BarChart3}
                  label="التقدم"
                  value={progressModeLabels[formData.progressMode]}
                  tone="dark"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12 hover:text-white"
                onClick={() => setLocation("/admin/projects")}
              >
                <ArrowRight className="ml-2 h-4 w-4" />
                رجوع إلى المشاريع
              </Button>

              <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-right shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                  Issue Number
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {cleanStr(formData.issueNumber) || "سيتم توليده تلقائيًا"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        data-project-section-nav
        className="sticky top-16 z-30 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.38)] backdrop-blur md:top-6"
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SECTION_DEFINITIONS.map((section, index) => {
            const isActive = activeSection === section.id;

            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setActiveSection(section.id)}
                className={`group min-w-max rounded-2xl border px-4 py-3 transition-all ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.7)]"
                    : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-9 items-center justify-center rounded-xl text-xs font-semibold ${
                      isActive
                        ? "bg-white/12 text-white"
                        : "bg-white text-slate-700 shadow-sm"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-900"}`}>
                      {section.shortTitle}
                    </p>
                    <p className={`text-xs ${isActive ? "text-slate-200" : "text-slate-500"}`}>
                      {sectionMeta[section.id]}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <form onSubmit={handleSubmit} className="space-y-6">
          <SectionCard
            id="basic"
            index={1}
            title="المعلومات الأساسية"
            description="ابدأ بهوية المشروع والعناوين والوصفين العربي والإنجليزي داخل تخطيط أكثر اتزانًا."
            icon={BriefcaseBusiness}
            headerAside={
              <>
                <Badge className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  {cleanStr(formData.titleAr) ? "العنوان جاهز" : "العنوان بانتظار الإدخال"}
                </Badge>
                <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                  {cleanStr(formData.descriptionAr) ? "الوصف العربي جاهز" : "الوصف العربي مطلوب"}
                </Badge>
              </>
            }
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="العنوان (عربي)" required>
                  <Input
                    dir="rtl"
                    className={`${inputClassName} text-right`}
                    value={formData.titleAr}
                    placeholder="مثال: مشروع أبراج العاصمة"
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, titleAr: e.target.value }))
                    }
                  />
                </Field>

                <Field label="العنوان (إنجليزي)">
                  <Input
                    dir="ltr"
                    className={`${inputClassName} text-left`}
                    value={formData.titleEn}
                    placeholder="Capital Towers Project"
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, titleEn: e.target.value }))
                    }
                  />
                </Field>

                <Field
                  label="الوصف (عربي)"
                  required
                  className="md:col-span-2"
                  hint="هذا النص هو أول ما يقرأه المستثمر داخل البطاقة وصفحة المشروع."
                >
                  <Textarea
                    rows={5}
                    dir="rtl"
                    className={`${textareaClassName} text-right leading-7`}
                    value={formData.descriptionAr}
                    placeholder="اكتب وصفًا مهنيًا يشرح فكرة المشروع والفرصة الاستثمارية."
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, descriptionAr: e.target.value }))
                    }
                  />
                </Field>

                <Field label="الوصف (إنجليزي)" className="md:col-span-2">
                  <Textarea
                    rows={5}
                    dir="ltr"
                    className={`${textareaClassName} text-left leading-7`}
                    value={formData.descriptionEn}
                    placeholder="Write the English project overview."
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, descriptionEn: e.target.value }))
                    }
                  />
                </Field>
              </div>

              <div className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-950">هوية المشروع</h3>
                    <p className="text-xs leading-6 text-slate-500">
                      اجعل العنوان موجزًا واحترافيًا، ثم استخدم الوصف العربي لعرض القيمة
                      الاستثمارية بشكل واضح ومقنع.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <MetricCard
                    icon={CheckCircle2}
                    label="العنوان العربي"
                    value={cleanStr(formData.titleAr) ? "مكتمل" : "غير مكتمل"}
                  />
                  <MetricCard
                    icon={CheckCircle2}
                    label="الوصف العربي"
                    value={cleanStr(formData.descriptionAr) ? "مكتمل" : "غير مكتمل"}
                  />
                  <MetricCard
                    icon={BriefcaseBusiness}
                    label="العنوان الإنجليزي"
                    value={cleanStr(formData.titleEn) ? "موجود" : "اختياري"}
                  />
                  <MetricCard
                    icon={BriefcaseBusiness}
                    label="الوصف الإنجليزي"
                    value={cleanStr(formData.descriptionEn) ? "موجود" : "اختياري"}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="details"
            index={2}
            title="بيانات المشروع"
            description="تنظيم نوع المشروع وحالته ورقم الإصدار والموقع ضمن شبكة أكثر وضوحًا."
            icon={Building2}
            headerAside={
              <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                {projectTypeLabels[formData.projectType]} · {statusLabels[formData.status]}
              </Badge>
            }
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="نوع المشروع">
                  <Select
                    value={formData.projectType}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        projectType: value as typeof prev.projectType,
                      }))
                    }
                  >
                    <SelectTrigger className={`${selectTriggerClassName} text-right`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sukuk">استثمار بالصكوك</SelectItem>
                      <SelectItem value="land_development">تطوير أراضٍ</SelectItem>
                      <SelectItem value="vip_exclusive">VIP حصري</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="الحالة">
                  <Select
                    value={formData.status}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        status: value as typeof prev.status,
                      }))
                    }
                  >
                    <SelectTrigger className={`${selectTriggerClassName} text-right`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">مسودة</SelectItem>
                      <SelectItem value="published">منشور</SelectItem>
                      <SelectItem value="closed">مغلق</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="رقم الإصدار">
                  <Input
                    dir="ltr"
                    className={`${inputClassName} text-left`}
                    value={formData.issueNumber}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, issueNumber: e.target.value }))
                    }
                  />
                </Field>

                <Field label="الموقع (عربي)" required>
                  <Input
                    dir="rtl"
                    className={`${inputClassName} text-right`}
                    value={formData.locationAr}
                    placeholder="الرياض، المملكة العربية السعودية"
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, locationAr: e.target.value }))
                    }
                  />
                </Field>

                <Field label="الموقع (إنجليزي)" className="md:col-span-2">
                  <Input
                    dir="ltr"
                    className={`${inputClassName} text-left`}
                    value={formData.locationEn}
                    placeholder="Riyadh, Saudi Arabia"
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, locationEn: e.target.value }))
                    }
                  />
                </Field>
              </div>

              <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <MapPinned className="h-4 w-4 text-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-950">ملف المشروع</h3>
                    <p className="text-xs leading-6 text-slate-500">
                      هذا القسم يحدد هوية المشروع داخل النظام، ويؤثر في تموضعه داخل القوائم
                      والإدارة ولوحات المتابعة.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <MetricCard
                    icon={Building2}
                    label="نوع المشروع"
                    value={projectTypeLabels[formData.projectType]}
                  />
                  <MetricCard
                    icon={FolderKanban}
                    label="الحالة الحالية"
                    value={statusLabels[formData.status]}
                  />
                  <MetricCard
                    icon={MapPinned}
                    label="الموقع"
                    value={cleanStr(formData.locationAr) || "بانتظار الإدخال"}
                  />
                </div>
              </div>
            </div>
          </SectionCard>
          <SectionCard
            id="media"
            index={3}
            title="الصور والمعرض"
            description="واجهة رفع أنظف لصورة الغلاف والمعرض مع معاينة مباشرة وتنظيم أفضل للروابط."
            icon={ImagePlus}
            headerAside={
              <>
                <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                  الغلاف {cleanStr(formData.coverImage) ? "جاهز" : "غير مرفوع"}
                </Badge>
                <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                  {galleryUrls.length} صور في المعرض
                </Badge>
              </>
            }
          >
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/70 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">صورة الغلاف</h3>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      العنصر البصري الرئيسي الذي يمثل المشروع داخل البطاقات والصفحات.
                    </p>
                  </div>
                  <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                    {coverUploading
                      ? "جارٍ الرفع..."
                      : cleanStr(formData.coverImage)
                        ? "مرفوع"
                        : "بانتظار"}
                  </Badge>
                </div>

                <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                  {cleanStr(formData.coverImage) ? (
                    <img
                      src={formData.coverImage}
                      alt="معاينة صورة الغلاف"
                      className="aspect-[16/9] h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[16/9] items-center justify-center bg-[linear-gradient(135deg,rgba(248,250,252,1),rgba(226,232,240,0.6))]">
                      <div className="space-y-2 text-center text-slate-500">
                        <FileImage className="mx-auto h-7 w-7" />
                        <p className="text-sm font-semibold">لا توجد صورة غلاف بعد</p>
                        <p className="text-xs">أضف رابطًا أو ارفع ملفًا لعرض المعاينة هنا.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  <Field
                    label="رابط صورة الغلاف"
                    required
                    hint="يمكنك الإبقاء على نفس منطق الرابط النصي الحالي أو استخدام الرفع المباشر."
                  >
                    <Input
                      value={formData.coverImage}
                      className={inputClassName}
                      placeholder="project-cover.png أو /project-cover.png أو https://..."
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, coverImage: e.target.value }))
                      }
                    />
                  </Field>

                  <UploadDropzone
                    inputId="project-cover-upload"
                    title="رفع صورة غلاف"
                    description="اسحب أو اختر صورة تمثل المشروع بصريًا."
                    accept="image/*"
                    disabled={coverUploading}
                    onChange={(e) => {
                      void handleCoverImageUpload(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                  />

                  {cleanStr(formData.coverImage) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 rounded-xl px-3 text-slate-600 hover:bg-slate-100"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, coverImage: "" }))
                      }
                    >
                      إزالة صورة الغلاف
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/70 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">معرض الصور</h3>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      أدر الصور كرابط لكل سطر مع إمكانية رفع عدة صور مباشرة وإظهارها داخل
                      معاينات منظمة.
                    </p>
                  </div>
                  <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                    {galleryUploading ? "جارٍ الرفع..." : `${galleryUrls.length} صورة`}
                  </Badge>
                </div>

                <div className="mt-5 space-y-4">
                  <Field
                    label="روابط المعرض"
                    hint="كل رابط في سطر مستقل. يمكن المزج بين الروابط المكتوبة والملفات المرفوعة."
                  >
                    <Textarea
                      rows={6}
                      value={formData.galleryText}
                      className={`${textareaClassName} leading-7`}
                      placeholder={"image-1.png\n/image-2.png\nhttps://..."}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, galleryText: e.target.value }))
                      }
                    />
                  </Field>

                  <UploadDropzone
                    inputId="project-gallery-upload"
                    title="رفع صور المعرض"
                    description="اختر عدة صور وسيتم إلحاق روابطها مباشرة بنفس الحقل الحالي."
                    accept="image/*"
                    multiple
                    disabled={galleryUploading}
                    onChange={(e) => {
                      void handleGalleryImageUpload(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    {galleryUrls.length ? (
                      galleryUrls.map((url, index) => (
                        <div
                          key={`${url}-${index}`}
                          className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm"
                        >
                          <div className="aspect-[4/3] bg-slate-100">
                            <img
                              src={url}
                              alt={`صورة المعرض ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="space-y-3 p-3">
                            <p className="line-clamp-2 text-xs leading-6 text-slate-500">
                              {url}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-xl"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  galleryText: galleryUrls
                                    .filter((_, galleryIndex) => galleryIndex !== index)
                                    .join("\n"),
                                }))
                              }
                            >
                              <Trash2 className="ml-2 h-4 w-4" />
                              حذف الصورة
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm text-slate-500 sm:col-span-2">
                        ستظهر معاينات صور المعرض هنا بعد إضافة الروابط أو رفع الصور.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="highlights"
            index={4}
            title="المميزات"
            description="حوّل قائمة المميزات إلى repeater بصري أنظف يساعد على قراءة العرض الاستثماري بسرعة."
            icon={Sparkles}
            headerAside={
              <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                {filledHighlights} مميزات مكتوبة
              </Badge>
            }
          >
            <div className="space-y-4">
              {highlightRows.map((row, index) => (
                <div
                  key={`highlight-${index}`}
                  className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">الميزة {index + 1}</p>
                      <p className="text-xs text-slate-500">
                        اكتب ميزة استثمارية قصيرة وواضحة.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl"
                      disabled={highlightRows.length === 1}
                      onClick={() =>
                        setHighlightRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index)
                        )
                      }
                    >
                      <Trash2 className="ml-2 h-4 w-4" />
                      حذف
                    </Button>
                  </div>

                  <Input
                    dir="rtl"
                    className={`${inputClassName} text-right`}
                    value={row}
                    placeholder={`الميزة ${index + 1}`}
                    onChange={(e) =>
                      setHighlightRows((prev) =>
                        prev.map((item, rowIndex) =>
                          rowIndex === index ? e.target.value : item
                        )
                      )
                    }
                  />
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-2xl border-dashed"
                onClick={() => setHighlightRows((prev) => [...prev, ""])}
              >
                <Plus className="ml-2 h-4 w-4" />
                إضافة ميزة جديدة
              </Button>
            </div>
          </SectionCard>
          <SectionCard
            id="attachments"
            index={5}
            title="المرفقات"
            description="كل مرفق يظهر الآن كبطاقة مستقلة تتضمن الاسم والرابط والرفع والمعاينة داخل صف واحد منظم."
            icon={Paperclip}
            headerAside={
              <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                {filledAttachments} مرفقات
              </Badge>
            }
          >
            <div className="space-y-4">
              {attachmentRows.map((row, index) => (
                <div
                  key={`attachment-${index}`}
                  className="rounded-[26px] border border-slate-200/80 bg-slate-50/80 p-5 shadow-sm"
                >
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">المرفق {index + 1}</p>
                      <p className="text-xs text-slate-500">
                        ارفع ملفًا أو أضف رابطًا خارجيًا مع اسم واضح للمرفق.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl"
                      disabled={attachmentRows.length === 1}
                      onClick={() =>
                        setAttachmentRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index)
                        )
                      }
                    >
                      <Trash2 className="ml-2 h-4 w-4" />
                      حذف المرفق
                    </Button>
                  </div>

                  <div className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="الاسم">
                        <Input
                          dir="rtl"
                          className={`${inputClassName} text-right`}
                          value={row.name}
                          placeholder={`اسم المرفق ${index + 1}`}
                          onChange={(e) =>
                            setAttachmentRows((prev) =>
                              prev.map((item, rowIndex) =>
                                rowIndex === index ? { ...item, name: e.target.value } : item
                              )
                            )
                          }
                        />
                      </Field>

                      <Field label="الرابط الخارجي (اختياري)">
                        <Input
                          dir="ltr"
                          className={`${inputClassName} text-left`}
                          value={row.externalUrl}
                          placeholder="https://example.com"
                          onChange={(e) =>
                            setAttachmentRows((prev) =>
                              prev.map((item, rowIndex) =>
                                rowIndex === index
                                  ? { ...item, externalUrl: e.target.value }
                                  : item
                              )
                            )
                          }
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-950">حالة الملف</p>
                            <p className="text-xs text-slate-500">
                              {row.uploading
                                ? "جارٍ رفع الملف إلى التخزين..."
                                : row.url
                                  ? "تم رفع الملف وهو جاهز للمراجعة."
                                  : "لم يتم رفع ملف لهذا المرفق بعد."}
                            </p>
                          </div>

                          {row.url ? (
                            <Badge className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                              Uploaded
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              عرض الملف المرفوع
                            </a>
                          ) : null}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl"
                            disabled={!row.url || row.uploading}
                            onClick={() =>
                              setAttachmentRows((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, url: "" } : item
                                )
                              )
                            }
                          >
                            مسح الملف
                          </Button>
                        </div>
                      </div>

                      <UploadDropzone
                        inputId={`attachment-upload-${index}`}
                        title="رفع مرفق"
                        description="ارفع ملف PDF أو صورة أو أي ملف داعم للمشروع."
                        accept="*/*"
                        disabled={row.uploading}
                        onChange={(e) => {
                          void handleAttachmentFileUpload(index, e.target.files?.[0] ?? null);
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-2xl border-dashed"
                onClick={() => setAttachmentRows((prev) => [...prev, { name: "", url: "", externalUrl: "" }])}
              >
                <Plus className="ml-2 h-4 w-4" />
                إضافة مرفق جديد
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            id="milestones"
            index={6}
            title="المراحل"
            description="مراحل التنفيذ في بطاقات mini-card مع تقسيم أوضح بين التاريخ والحالة والوصف."
            icon={ListChecks}
            headerAside={
              <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                {filledMilestones} مراحل
              </Badge>
            }
          >
            <div className="space-y-4">
              {milestoneRows.map((row, index) => (
                <div
                  key={`milestone-${index}`}
                  className="rounded-[26px] border border-slate-200/80 bg-slate-50/80 p-5 shadow-sm"
                >
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">المرحلة {index + 1}</p>
                      <p className="text-xs text-slate-500">
                        نظّم العنوان والتاريخ والحالة والوصف داخل صف واضح للمراجعة.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl"
                      disabled={milestoneRows.length === 1}
                      onClick={() =>
                        setMilestoneRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index)
                        )
                      }
                    >
                      <Trash2 className="ml-2 h-4 w-4" />
                      حذف المرحلة
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="العنوان">
                      <Input
                        dir="rtl"
                        className={`${inputClassName} text-right`}
                        value={row.title}
                        placeholder={`عنوان المرحلة ${index + 1}`}
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, rowIndex) =>
                              rowIndex === index ? { ...item, title: e.target.value } : item
                            )
                          )
                        }
                      />
                    </Field>

                    <Field label="التاريخ">
                      <Input
                        dir="ltr"
                        className={`${inputClassName} text-left`}
                        value={row.date}
                        placeholder="2026-02"
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, rowIndex) =>
                              rowIndex === index ? { ...item, date: e.target.value } : item
                            )
                          )
                        }
                      />
                    </Field>

                    <Field label="الحالة">
                      <Input
                        dir="rtl"
                        className={`${inputClassName} text-right`}
                        value={row.status}
                        placeholder="قيد التنفيذ"
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, rowIndex) =>
                              rowIndex === index ? { ...item, status: e.target.value } : item
                            )
                          )
                        }
                      />
                    </Field>

                    <Field label="الوصف">
                      <Input
                        dir="rtl"
                        className={`${inputClassName} text-right`}
                        value={row.description}
                        placeholder="وصف مختصر"
                        onChange={(e) =>
                          setMilestoneRows((prev) =>
                            prev.map((item, rowIndex) =>
                              rowIndex === index
                                ? { ...item, description: e.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-2xl border-dashed"
                onClick={() =>
                  setMilestoneRows((prev) => [
                    ...prev,
                    { title: "", date: "", status: "", description: "" },
                  ])
                }
              >
                <Plus className="ml-2 h-4 w-4" />
                إضافة مرحلة جديدة
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            id="faq"
            index={7}
            title="الأسئلة الشائعة"
            description="الأسئلة والأجوبة ضمن بطاقات أكثر ترتيبًا لتسهيل قراءة المحتوى المتكرر."
            icon={CircleHelp}
            headerAside={
              <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                {filledFaq} أسئلة
              </Badge>
            }
          >
            <div className="space-y-4">
              {faqRows.map((row, index) => (
                <div
                  key={`faq-${index}`}
                  className="rounded-[26px] border border-slate-200/80 bg-slate-50/80 p-5 shadow-sm"
                >
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">السؤال {index + 1}</p>
                      <p className="text-xs text-slate-500">
                        أضف سؤالًا شائعًا وإجابة واضحة للمستثمر.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl"
                      disabled={faqRows.length === 1}
                      onClick={() =>
                        setFaqRows((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index)
                        )
                      }
                    >
                      <Trash2 className="ml-2 h-4 w-4" />
                      حذف السؤال
                    </Button>
                  </div>

                  <div className="grid gap-4">
                    <Field label="السؤال">
                      <Input
                        dir="rtl"
                        className={`${inputClassName} text-right`}
                        value={row.q}
                        placeholder={`السؤال ${index + 1}`}
                        onChange={(e) =>
                          setFaqRows((prev) =>
                            prev.map((item, rowIndex) =>
                              rowIndex === index ? { ...item, q: e.target.value } : item
                            )
                          )
                        }
                      />
                    </Field>

                    <Field label="الجواب">
                      <Textarea
                        rows={3}
                        dir="rtl"
                        className={`${textareaClassName} min-h-[120px] text-right leading-7`}
                        value={row.a}
                        placeholder="اكتب الجواب"
                        onChange={(e) =>
                          setFaqRows((prev) =>
                            prev.map((item, rowIndex) =>
                              rowIndex === index ? { ...item, a: e.target.value } : item
                            )
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-2xl border-dashed"
                onClick={() => setFaqRows((prev) => [...prev, { q: "", a: "" }])}
              >
                <Plus className="ml-2 h-4 w-4" />
                إضافة سؤال جديد
              </Button>
            </div>
          </SectionCard>
          <SectionCard
            id="finance"
            index={8}
            title="البيانات المالية"
            description="قسم مالي أوضح وأكثر إبرازًا يضع المستهدف والحالي والعائد والمدة ضمن شبكة استثمارية منظمة."
            icon={Landmark}
            toneClassName="bg-[linear-gradient(135deg,rgba(11,23,38,0.07),rgba(242,174,48,0.11),rgba(255,255,255,0.98))] border-b border-slate-200/70 pb-6"
            headerAside={
              <Badge className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
                Financial Snapshot
              </Badge>
            }
          >
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  icon={Target}
                  label="المبلغ المستهدف"
                  value={formatDisplayValue(formData.targetAmount, "ر.س")}
                />
                <MetricCard
                  icon={BarChart3}
                  label="المبلغ الحالي"
                  value={formatDisplayValue(formData.currentAmount, "ر.س")}
                />
                <MetricCard
                  icon={Landmark}
                  label="الحد الأدنى"
                  value={formatDisplayValue(formData.minInvestment, "ر.س")}
                />
                <MetricCard
                  icon={Sparkles}
                  label="العائد السنوي"
                  value={formatDisplayValue(formData.annualReturn, "%")}
                />
              </div>

              <div className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5 shadow-sm">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="المبلغ المستهدف">
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      className={`${inputClassName} text-left`}
                      value={formData.targetAmount}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, targetAmount: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="المبلغ الحالي">
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      className={`${inputClassName} text-left`}
                      value={formData.currentAmount}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, currentAmount: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="الحد الأدنى">
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      className={`${inputClassName} text-left`}
                      value={formData.minInvestment}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, minInvestment: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="العائد السنوي %">
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      className={`${inputClassName} text-left`}
                      value={formData.annualReturn}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, annualReturn: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="المدة بالشهور">
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      className={`${inputClassName} text-left`}
                      value={formData.duration}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, duration: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="عدد المستثمرين">
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      className={`${inputClassName} text-left`}
                      value={formData.investorsCount}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, investorsCount: e.target.value }))
                      }
                    />
                  </Field>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="progress"
            index={9}
            title="مصدر التقدم"
            description="ربط طريقة الحساب بالأوزان الحالية داخل واجهة أوضح تشرح العلاقة بين التمويل والمراحل."
            icon={Gauge}
            headerAside={
              <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                {progressModeLabels[formData.progressMode]}
              </Badge>
            }
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-5 md:grid-cols-3">
                <Field label="طريقة الحساب" className="md:col-span-3">
                  <Select
                    value={formData.progressMode}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        progressMode: value as typeof prev.progressMode,
                      }))
                    }
                  >
                    <SelectTrigger className={`${selectTriggerClassName} text-right`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="funding">حسب التمويل فقط</SelectItem>
                      <SelectItem value="milestones">حسب المراحل فقط</SelectItem>
                      <SelectItem value="hybrid">هجين (تمويل + مراحل)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {formData.progressMode === "hybrid" ? (
                  <>
                    <Field label="معدل التمويل (%)">
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        className={`${inputClassName} text-left`}
                        value={formData.progressFundingWeight}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            progressFundingWeight: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="معدل المراحل (%)">
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        className={`${inputClassName} text-left`}
                        value={formData.progressMilestonesWeight}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            progressMilestonesWeight: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Total Weight
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {progressWeightsTotal}%
                      </p>
                      <p
                        className={`mt-2 text-xs leading-6 ${
                          progressWeightsTotal === 100 ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {progressWeightsTotal === 100
                          ? "التوزيع الحالي متوازن على 100%."
                          : "هذا المؤشر بصري فقط ولا يغير الفاليديشن الحالي."}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Gauge className="h-4 w-4 text-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-950">شرح طريقة الحساب</h3>
                    <p className="text-xs leading-6 text-slate-500">
                      {progressModeNarratives[formData.progressMode]}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <MetricCard
                    icon={BarChart3}
                    label="الوضع الحالي"
                    value={progressModeLabels[formData.progressMode]}
                  />
                  <MetricCard
                    icon={Target}
                    label="وزن التمويل"
                    value={formatDisplayValue(formData.progressFundingWeight, "%")}
                  />
                  <MetricCard
                    icon={ListChecks}
                    label="وزن المراحل"
                    value={formatDisplayValue(formData.progressMilestonesWeight, "%")}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="options"
            index={10}
            title="خيارات إضافية"
            description="إدارة ميزة المشروع وامتيازات VIP ضمن بلوك مستقل وواضح بصريًا."
            icon={Crown}
            headerAside={
              <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                {formData.isVip === "true" || formData.projectType === "vip_exclusive"
                  ? `VIP ${vipTierLabels[formData.vipTier]}`
                  : "إعدادات افتراضية"}
              </Badge>
            }
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-5 md:grid-cols-3">
                <Field label="مميز (featured)">
                  <Select
                    value={formData.featured}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        featured: value as "true" | "false",
                      }))
                    }
                  >
                    <SelectTrigger className={`${selectTriggerClassName} text-right`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">لا</SelectItem>
                      <SelectItem value="true">نعم</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="VIP (isVip)">
                  <Select
                    value={formData.isVip}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        isVip: value as "true" | "false",
                      }))
                    }
                  >
                    <SelectTrigger className={`${selectTriggerClassName} text-right`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">لا</SelectItem>
                      <SelectItem value="true">نعم</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="مستوى VIP (vipTier)">
                  <Select
                    value={formData.vipTier}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        vipTier: value as typeof prev.vipTier,
                      }))
                    }
                  >
                    <SelectTrigger className={`${selectTriggerClassName} text-right`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="silver">Silver</SelectItem>
                      <SelectItem value="gold">Gold</SelectItem>
                      <SelectItem value="platinum">Platinum</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Crown className="h-4 w-4 text-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-950">وضع العرض</h3>
                    <p className="text-xs leading-6 text-slate-500">
                      راجع كيف سيظهر المشروع داخل القوائم وما إذا كان يحتاج إبرازًا أو قصرًا
                      على فئة VIP.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <MetricCard
                    icon={Sparkles}
                    label="Featured"
                    value={formData.featured === "true" ? "نعم" : "لا"}
                  />
                  <MetricCard
                    icon={Crown}
                    label="VIP"
                    value={
                      formData.isVip === "true" || formData.projectType === "vip_exclusive"
                        ? "مفعّل"
                        : "غير مفعّل"
                    }
                  />
                  <MetricCard
                    icon={Crown}
                    label="VIP Tier"
                    value={vipTierLabels[formData.vipTier]}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="sticky bottom-4 z-30 pt-2">
            <div className="flex flex-col gap-4 rounded-[26px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.4)] backdrop-blur md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                  <Save className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">إجراءات الإنشاء</p>
                  <p className="text-xs leading-6 text-slate-500">
                    سيتم حفظ نفس الحقول ونفس الـ validation الحالي.{" "}
                    {hasUploadingAttachment
                      ? "يوجد مرفق قيد الرفع حاليًا."
                      : "راجع العناصر الأساسية ثم أنشئ المشروع."}
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-2xl px-5"
                  disabled={isBusy}
                  onClick={() => setLocation("/admin/projects")}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  className="h-12 rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-[0_18px_30px_-18px_rgba(15,23,42,0.7)] hover:bg-slate-800"
                  disabled={isBusy}
                >
                  <Save className="ml-2 h-4 w-4" />
                  {saving ? "جاري إنشاء المشروع..." : "إنشاء المشروع"}
                </Button>
              </div>
            </div>
          </div>
        </form>

        <aside className="hidden xl:block">
          <SectionCard
            id="summary-panel"
            index={0}
            title="لوحة التنقل"
            description="انتقال سريع بين الأقسام مع ملخص جاهزية الصفحة قبل إنشاء المشروع."
            icon={FolderKanban}
          >
            <div className="space-y-5">
              <div className="space-y-2">
                {SECTION_DEFINITIONS.map((section, index) => {
                  const isActive = activeSection === section.id;

                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      onClick={() => setActiveSection(section.id)}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 transition-all ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.7)]"
                          : "border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-white"
                      }`}
                    >
                      <div className="min-w-0 text-right">
                        <p className="text-sm font-semibold">{section.title}</p>
                        <p className={`mt-1 text-xs ${isActive ? "text-slate-200" : "text-slate-500"}`}>
                          {sectionMeta[section.id]}
                        </p>
                      </div>

                      <div className="mr-4 flex items-center gap-3">
                        <span
                          className={`flex size-9 items-center justify-center rounded-xl text-xs font-semibold ${
                            isActive
                              ? "bg-white/12 text-white"
                              : "bg-white text-slate-700 shadow-sm"
                          }`}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <ChevronLeft className="h-4 w-4 shrink-0" />
                      </div>
                    </a>
                  );
                })}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">عناصر أساسية</p>
                    <p className="text-xs text-slate-500">يجب أن تكون جاهزة قبل الحفظ.</p>
                  </div>
                  <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                    {requiredReady}/4
                  </Badge>
                </div>

                <div className="space-y-3">
                  {requiredChecklist.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-2xl border border-white bg-white/90 px-3 py-2.5"
                    >
                      <span className="text-sm text-slate-700">{item.label}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          item.ready
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.ready ? "جاهز" : "مطلوب"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <MetricCard
                  icon={FolderKanban}
                  label="معرّف المسودة"
                  value={draftProjectId.slice(0, 8)}
                />
                <MetricCard
                  icon={ImagePlus}
                  label="الوسائط"
                  value={`${totalAssets} عناصر مرتبطة`}
                />
                <MetricCard
                  icon={Crown}
                  label="VIP"
                  value={
                    formData.isVip === "true" || formData.projectType === "vip_exclusive"
                      ? `مفعّل · ${vipTierLabels[formData.vipTier]}`
                      : "غير مفعّل"
                  }
                />
              </div>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
