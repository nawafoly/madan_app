import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import MediaBrandingSettings from "@/pages/admin/MediaBrandingSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Archive,
  CheckCircle2,
  Globe,
  Mail,
  Image as ImageIcon,
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import type { SiteMediaSettings } from "@/lib/siteContentMedia";
import type {
  NextStepSliderSettings,
  NextStepSliderSlide,
} from "@/lib/siteContent";
import { uploadDocumentToCloudflare } from "@/lib/documentUploadService";
import { toast } from "sonner";

type ContentSettings = {
  heroTitleAr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleEn: string;
  footerAboutAr: string;
  footerAboutEn: string;
  contactEmail: string;
  contactPhone: string;
  media: SiteMediaSettings;
  nextStepSlider: NextStepSliderSettings;
};

type ContentFieldKey = Exclude<keyof ContentSettings, "media" | "nextStepSlider">;

type SettingsContentTabProps = {
  content: ContentSettings;
  contentCompletedCount: number;
  onContentFieldChange: (key: ContentFieldKey, value: string) => void;
  onContentChange: Dispatch<SetStateAction<ContentSettings>>;
  onSaveContent: () => Promise<void>;
  savingContent: boolean;
};

export default function SettingsContentTab({
  content,
  contentCompletedCount,
  onContentFieldChange,
  onContentChange,
  onSaveContent,
  savingContent,
}: SettingsContentTabProps) {
  const [activeContentView, setActiveContentView] = useState<
    "text" | "media" | "slider"
  >("text");

  return (
    <TabsContent value="content" className="space-y-6">
      <SettingsTabHero
        eyebrow="إدارة المحتوى"
        title="محتوى الموقع"
        description="إدارة النصوص العامة للواجهة من داخل لوحة منظمة تشبه الأنظمة الإدارية الاحترافية، مع فصل واضح بين الواجهة الرئيسية والتذييل وبيانات التواصل."
        stats={[
          {
            icon: Type,
            label: "الحقول",
            value: formatNumberEN(Object.keys(content).length),
            helper: "إجمالي حقول المحتوى المتاحة",
          },
          {
            icon: CheckCircle2,
            label: "المكتمل",
            value: formatNumberEN(contentCompletedCount),
            helper: "الحقول التي تحتوي على قيمة",
          },
          {
            icon: Globe,
            label: "اللغات",
            value: "عربي / إنجليزي",
            helper: "محتوى عربي وإنجليزي",
          },
        ]}
        panel={
          <SettingsHeroPanel
            status="تحرير المحتوى"
            title="واجهة المحتوى"
            description="يتم هنا ضبط النصوص العامة للمنصة من دون أي تغيير على بنية الصفحات أو منطق عرضها."
            metrics={[
              {
                label: "الواجهة الرئيسية",
                value:
                  content.heroTitleAr || content.heroTitleEn
                    ? "مكتمل جزئيًا"
                    : "فارغ",
                helper: "العنوان والوصف الرئيسي",
              },
              {
                label: "التذييل",
                value:
                  content.footerAboutAr || content.footerAboutEn
                    ? "مكتمل جزئيًا"
                    : "فارغ",
                helper: "نص تعريف المنصة",
              },
              {
                label: "التواصل",
                value:
                  content.contactEmail || content.contactPhone
                    ? "جاهز"
                    : "غير مكتمل",
                helper: "قنوات التواصل في الواجهة",
              },
            ]}
          />
        }
      />

      <div className="rounded-[26px] border border-slate-200/80 bg-white p-2 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.3)]">
        <div className="grid gap-2 md:grid-cols-3">
          <ContentSubTabButton
            active={activeContentView === "text"}
            icon={Type}
            title="النصوص العامة وبيانات التواصل"
            description="العناوين، الوصف، التذييل، وبيانات التواصل."
            onClick={() => setActiveContentView("text")}
          />
          <ContentSubTabButton
            active={activeContentView === "media"}
            icon={ImageIcon}
            title="الوسائط والهوية"
            description="الشعار، الصور، الفيديوهات، ووسائط الصفحات."
            onClick={() => setActiveContentView("media")}
          />
          <ContentSubTabButton
            active={activeContentView === "slider"}
            icon={Sparkles}
            title="سلايدر الخطوة التالية"
            description="صور السلايدر، الروابط، والترتيب ووقت الحركة التلقائية."
            onClick={() => setActiveContentView("slider")}
          />
        </div>
      </div>

      {activeContentView === "text" ? (
      <div className="space-y-6">
        <div className="space-y-6">
          <SettingsSectionCard
            icon={Type}
            eyebrow="الوحدة 01"
            title="محتوى الواجهة الرئيسية"
            description="النصوص الرئيسية التي تشكل الانطباع الأول داخل الواجهة."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <SettingsField
                label="العنوان الرئيسي (عربي)"
                description="العنوان الرئيسي للواجهة باللغة العربية."
                placeholder="اكتب العنوان العربي"
                value={content.heroTitleAr}
                onChange={value =>
                  onContentFieldChange("heroTitleAr", value)
                }
              />
              <SettingsField
                label="العنوان الرئيسي (إنجليزي)"
                description="العنوان الرئيسي للواجهة باللغة الإنجليزية."
                placeholder="اكتب العنوان الإنجليزي"
                value={content.heroTitleEn}
                onChange={value =>
                  onContentFieldChange("heroTitleEn", value)
                }
                dir="ltr"
                inputClassName="text-left"
              />
              <SettingsField
                label="الوصف الرئيسي (عربي)"
                description="وصف مختصر يشرح القيمة الأساسية للمنصة."
                placeholder="اكتب الوصف العربي"
                value={content.heroSubtitleAr}
                onChange={value =>
                  onContentFieldChange("heroSubtitleAr", value)
                }
                textarea
                rows={4}
                containerClassName="md:col-span-2"
              />
              <SettingsField
                label="الوصف الرئيسي (إنجليزي)"
                description="الوصف الداعم للواجهة باللغة الإنجليزية."
                placeholder="اكتب الوصف الإنجليزي"
                value={content.heroSubtitleEn}
                onChange={value =>
                  onContentFieldChange("heroSubtitleEn", value)
                }
                textarea
                rows={4}
                dir="ltr"
                inputClassName="text-left"
                containerClassName="md:col-span-2"
              />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={Archive}
            eyebrow="الوحدة 02"
            title="محتوى التذييل"
            description="المحتوى التعريفي في تذييل المنصة باللغتين العربية والإنجليزية."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <SettingsField
                label="نبذة التذييل (عربي)"
                description="النص التعريفي العربي المختصر في التذييل."
                placeholder="اكتب وصفًا مختصرًا للمنصة"
                value={content.footerAboutAr}
                onChange={value =>
                  onContentFieldChange("footerAboutAr", value)
                }
                textarea
                rows={4}
              />
              <SettingsField
                label="نبذة التذييل (إنجليزي)"
                description="الوصف الإنجليزي المختصر في التذييل."
                placeholder="اكتب وصفًا مختصرًا باللغة الإنجليزية"
                value={content.footerAboutEn}
                onChange={value =>
                  onContentFieldChange("footerAboutEn", value)
                }
                textarea
                rows={4}
                dir="ltr"
                inputClassName="text-left"
              />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={Mail}
            eyebrow="الوحدة 03"
            title="محتوى التواصل"
            description="بيانات التواصل التي تعرض للمستخدمين داخل واجهة المنصة."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <SettingsField
                label="بريد التواصل"
                description="البريد الظاهر للمستخدمين في الواجهة."
                placeholder="support@maedin.sa"
                value={content.contactEmail}
                onChange={value =>
                  onContentFieldChange("contactEmail", value)
                }
                dir="ltr"
                inputClassName="text-left"
              />
              <SettingsField
                label="هاتف التواصل"
                description="رقم الهاتف المعروض في بيانات التواصل."
                placeholder="+966 5X XXX XXXX"
                value={content.contactPhone}
                onChange={value =>
                  onContentFieldChange("contactPhone", value)
                }
                dir="ltr"
                inputClassName="text-left"
              />
            </div>
          </SettingsSectionCard>
        </div>
      </div>
      ) : activeContentView === "media" ? (
        <MediaBrandingSettings
          media={content.media}
          onMediaChange={mediaUpdate =>
            onContentChange(previous => ({
              ...previous,
              media:
                typeof mediaUpdate === "function"
                  ? mediaUpdate(previous.media)
                  : mediaUpdate,
            }))
          }
          onSave={onSaveContent}
          saving={savingContent}
        />
      ) : (
        <NextStepSliderSettingsPanel
          slider={content.nextStepSlider}
          onSliderChange={sliderUpdate =>
            onContentChange(previous => ({
              ...previous,
              nextStepSlider:
                typeof sliderUpdate === "function"
                  ? sliderUpdate(previous.nextStepSlider)
                  : sliderUpdate,
            }))
          }
          onSave={onSaveContent}
          saving={savingContent}
        />
      )}
    </TabsContent>
  );
}

function NextStepSliderSettingsPanel({
  slider,
  onSliderChange,
  onSave,
  saving,
}: {
  slider: NextStepSliderSettings;
  onSliderChange: Dispatch<SetStateAction<NextStepSliderSettings>>;
  onSave: () => Promise<void>;
  saving: boolean;
}) {
  const [uploadingSlideId, setUploadingSlideId] = useState<string | null>(null);
  const [localPreviewById, setLocalPreviewById] = useState<Record<string, string>>(
    {}
  );
  const previewUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
      previewUrlsRef.current = {};
    };
  }, []);

  const updateSlide = (slideId: string, patch: Partial<NextStepSliderSlide>) => {
    onSliderChange(current => ({
      ...current,
      slides: current.slides.map(slide =>
        slide.id === slideId ? { ...slide, ...patch } : slide
      ),
    }));
  };

  const addSlide = () => {
    const id = `next-step-${Date.now()}`;
    onSliderChange(current => ({
      ...current,
      slides: [
        ...current.slides,
        {
          id,
          imageUrl: "",
          alt: "Next step slide",
          linkUrl: "",
        },
      ],
    }));
  };

  const removeSlide = (slideId: string) => {
    onSliderChange(current => ({
      ...current,
      slides: current.slides.filter(slide => slide.id !== slideId),
    }));
  };

  const moveSlide = (slideId: string, direction: -1 | 1) => {
    onSliderChange(current => {
      const index = current.slides.findIndex(slide => slide.id === slideId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.slides.length) {
        return current;
      }

      const slides = [...current.slides];
      const [slide] = slides.splice(index, 1);
      slides.splice(nextIndex, 0, slide);
      return { ...current, slides };
    });
  };

  const setLocalPreview = (slideId: string, file: File) => {
    const previous = previewUrlsRef.current[slideId];
    if (previous) URL.revokeObjectURL(previous);
    const objectUrl = URL.createObjectURL(file);
    previewUrlsRef.current[slideId] = objectUrl;
    setLocalPreviewById(current => ({ ...current, [slideId]: objectUrl }));
  };

  const clearLocalPreview = (slideId: string) => {
    const objectUrl = previewUrlsRef.current[slideId];
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    delete previewUrlsRef.current[slideId];
    setLocalPreviewById(current => {
      const next = { ...current };
      delete next[slideId];
      return next;
    });
  };

  const handleSlideUpload = async (
    slide: NextStepSliderSlide,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    setLocalPreview(slide.id, file);
    setUploadingSlideId(slide.id);

    try {
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "site_content",
        entityId: slide.id,
        category: "site_media",
        kind: "attachment",
        file,
        storageFolder: "next-step-slider",
      });

      updateSlide(slide.id, {
        imageUrl: uploaded.fileUrl,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        contentType: uploaded.contentType,
        uploadedAt: uploaded.uploadedAt,
      });
      clearLocalPreview(slide.id);
      toast.success("تم رفع صورة السلايدر. احفظ المحتوى لنشر التعديل.");
    } catch (error) {
      clearLocalPreview(slide.id);
      toast.error(
        error instanceof Error ? error.message : "فشل رفع صورة السلايدر"
      );
    } finally {
      setUploadingSlideId(null);
    }
  };

  const delaySeconds = Math.round((slider.autoplayDelayMs || 5000) / 1000);
  const uploadInProgress = Boolean(uploadingSlideId);

  return (
    <div className="space-y-6">
      <SettingsSectionCard
        icon={Sparkles}
        eyebrow="الوحدة 04"
        title="سلايدر الخطوة التالية"
        description="إدارة الصور المتحركة التي تظهر داخل قسم الخطوة التالية، مع ترتيب الصور والروابط وسرعة التنقل التلقائي."
        action={
          <Button
            type="button"
            className="h-10 rounded-xl"
            onClick={onSave}
            disabled={saving || uploadInProgress}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ
          </Button>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <SettingsField
            label="وقت التنقل التلقائي"
            description="المدة بين كل صورة والتي تليها."
            value={String(delaySeconds)}
            onChange={value => {
              const seconds = Number(value);
              onSliderChange(current => ({
                ...current,
                autoplayDelayMs: Number.isFinite(seconds)
                  ? Math.min(Math.max(Math.round(seconds * 1000), 1500), 60000)
                  : current.autoplayDelayMs,
              }));
            }}
            type="number"
            inputMode="numeric"
            suffix="ثانية"
            helper="القيمة تحفظ بالميلي ثانية داخل الإعدادات وتعرض هنا بالثواني."
          />

          <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-950">
                  الصور الحالية
                </div>
                <p className="mt-1 text-xs leading-6 text-slate-500">
                  {formatNumberEN(slider.slides.length)} صورة مرتبة حسب الظهور.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={addSlide}
              >
                <Plus className="h-4 w-4" />
                إضافة صورة
              </Button>
            </div>
          </div>
        </div>
      </SettingsSectionCard>

      <div className="grid gap-4">
        {slider.slides.map((slide, index) => {
          const previewUrl = localPreviewById[slide.id] || slide.imageUrl;
          const uploading = uploadingSlideId === slide.id;

          return (
            <Card
              key={slide.id}
              className="overflow-hidden rounded-[24px] border-slate-200/80 bg-white shadow-[0_18px_42px_-34px_rgba(15,23,42,0.28)]"
            >
              <CardContent className="grid gap-5 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-slate-100">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={slide.alt || `slide ${index + 1}`}
                      className="h-44 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center text-sm text-slate-500">
                      لا توجد صورة
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Badge
                        variant="outline"
                        className="rounded-full border-slate-200 bg-slate-50 text-slate-600"
                      >
                        صورة {formatNumberEN(index + 1)}
                      </Badge>
                      <p className="mt-2 text-xs text-slate-500">
                        {slide.fileName || slide.imageUrl || "صورة غير محفوظة بعد"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-xl"
                        onClick={() => moveSlide(slide.id, -1)}
                        disabled={index === 0}
                        aria-label="رفع الصورة في الترتيب"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-xl"
                        onClick={() => moveSlide(slide.id, 1)}
                        disabled={index === slider.slides.length - 1}
                        aria-label="خفض الصورة في الترتيب"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <label
                        className={cn(
                          "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-input px-4 text-sm font-medium shadow-xs transition-all hover:bg-muted",
                          uploading && "pointer-events-none opacity-50"
                        )}
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UploadCloud className="h-4 w-4" />
                        )}
                        رفع
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={uploading}
                          onChange={event => handleSlideUpload(slide, event)}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-rose-600 hover:text-rose-700"
                        onClick={() => removeSlide(slide.id)}
                        disabled={slider.slides.length <= 1}
                        aria-label="حذف الصورة"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <SettingsField
                      label="رابط الصورة"
                      description="يمكن إدخال الرابط يدوياً أو استخدام الرفع."
                      value={slide.imageUrl}
                      onChange={value => updateSlide(slide.id, { imageUrl: value })}
                      placeholder="/image.jpg أو https://..."
                      dir="ltr"
                      inputClassName="text-left"
                    />
                    <SettingsField
                      label="رابط الضغط"
                      description="وجه المستخدم لهذا الرابط عند الضغط على الصورة."
                      value={slide.linkUrl || ""}
                      onChange={value => updateSlide(slide.id, { linkUrl: value })}
                      placeholder="/projects أو https://..."
                      dir="ltr"
                      inputClassName="text-left"
                    />
                    <SettingsField
                      label="النص البديل"
                      description="وصف مختصر للصورة."
                      value={slide.alt || ""}
                      onChange={value => updateSlide(slide.id, { alt: value })}
                      placeholder="وصف الصورة"
                      containerClassName="md:col-span-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ContentSubTabButton({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-4 rounded-[22px] border p-4 text-right transition-all",
        active
          ? "border-slate-900 bg-slate-950 text-white shadow-md"
          : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white"
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
          active
            ? "border-white/10 bg-white/10 text-white"
            : "border-slate-200 bg-white text-slate-600"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 space-y-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            active ? "text-white" : "text-slate-950"
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "block text-xs leading-6",
            active ? "text-white/60" : "text-slate-500"
          )}
        >
          {description}
        </span>
      </span>
    </button>
  );
}

function SettingsTabHero({
  eyebrow,
  title,
  description,
  stats,
  panel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stats: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    helper: string;
  }>;
  panel: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.14),transparent_25%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] shadow-[0_28px_75px_-44px_rgba(15,23,42,0.35)]">
      <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] xl:items-end">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-[#F2B705]/30 bg-[#F2B705]/12 px-3 py-1 text-xs font-semibold text-[#8d6700] shadow-none">
                <Sparkles className="h-3.5 w-3.5" />
                {eyebrow}
              </Badge>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                {title}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                {description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {stats.map(stat => (
                <SettingsOverviewStat
                  key={stat.label}
                  icon={stat.icon}
                  label={stat.label}
                  value={stat.value}
                  helper={stat.helper}
                />
              ))}
            </div>
          </div>

          {panel}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsHeroPanel({
  status,
  title,
  description,
  metrics,
}: {
  status: string;
  title: string;
  description: string;
  metrics: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
}) {
  return (
    <div className="rounded-[28px] border border-[#1e3358] bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_28px_60px_-42px_rgba(2,6,23,0.85)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            الجاهزية
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight">{title}</h3>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80 shadow-none"
        >
          {status}
        </Badge>
      </div>

      <p className="mt-4 text-sm leading-7 text-white/60">{description}</p>

      <div className="mt-6 grid gap-3">
        {metrics.map(metric => (
          <SettingsSidebarMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            helper={metric.helper}
          />
        ))}
      </div>
    </div>
  );
}

function SettingsOverviewStat({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-700">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-xs leading-6 text-slate-500">{helper}</div>
    </div>
  );
}

function SettingsSidebarMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs text-white/55">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white/92">{value}</div>
      <div className="mt-1 text-xs text-white/50">{helper}</div>
    </div>
  );
}

function SettingsSectionCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  className,
  headerClassName,
  contentClassName,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]",
        className
      )}
    >
      <CardHeader
        className={cn("border-b border-slate-100/80 pb-6", headerClassName)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {eyebrow}
              </div>
              <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                {title}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                {description}
              </CardDescription>
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-6", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

function SettingsField({
  label,
  description,
  value,
  onChange,
  placeholder,
  helper,
  error,
  suffix,
  type = "text",
  textarea = false,
  rows = 3,
  dir,
  inputMode,
  className,
  containerClassName,
  inputClassName,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  suffix?: string;
  type?: string;
  textarea?: boolean;
  rows?: number;
  dir?: "ltr" | "rtl";
  inputMode?: ComponentProps<"input">["inputMode"];
  className?: string;
  containerClassName?: string;
  inputClassName?: string;
}) {
  const hasValue = String(value || "").trim().length > 0;
  const statusTone = error
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : hasValue
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-500";

  const sharedControlClassName = cn(
    "rounded-xl border-slate-200 bg-white/90 px-4 text-sm shadow-none transition hover:border-slate-300 focus-visible:ring-slate-300/60",
    error && "border-rose-300 bg-rose-50/60 focus-visible:ring-rose-200",
    hasValue && !error && "border-emerald-300/80 bg-emerald-50/30",
    inputClassName,
    className
  );

  return (
    <div className={cn("space-y-3", containerClassName)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label className="text-[13px] font-semibold text-slate-900">
            {label}
          </Label>
          <p className="text-xs leading-6 text-slate-500">{description}</p>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            statusTone
          )}
        >
          {error ? "يحتاج مراجعة" : hasValue ? "مكتمل" : "بانتظار الإدخال"}
        </div>
      </div>

      {textarea ? (
        <Textarea
          rows={rows}
          dir={dir}
          value={value}
          aria-invalid={!!error}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={cn("min-h-[108px] py-3 leading-7", sharedControlClassName)}
        />
      ) : suffix ? (
        <InputGroup className="h-12 rounded-xl border-slate-200 bg-white/90 shadow-none">
          <InputGroupInput
            type={type}
            dir={dir}
            value={value}
            inputMode={inputMode}
            aria-invalid={!!error}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            className={cn("h-full px-4", sharedControlClassName)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText className="text-xs font-semibold text-slate-500">
              {suffix}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input
          type={type}
          dir={dir}
          value={value}
          inputMode={inputMode}
          aria-invalid={!!error}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={cn("h-12", sharedControlClassName)}
        />
      )}

      <p
        className={cn(
          "text-xs leading-6",
          error ? "text-rose-600" : "text-slate-500"
        )}
      >
        {error || helper || " "}
      </p>
    </div>
  );
}
