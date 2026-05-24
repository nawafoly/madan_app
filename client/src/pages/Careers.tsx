import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  BriefcaseBusiness,
  ClipboardCheck,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/_core/firebase";
import RecruitmentFormFields from "@/components/recruitment/RecruitmentFormFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSiteContent } from "@/contexts/SiteContentContext";
import { uploadDocumentToCloudflare, type UploadDocumentResult } from "@/lib/documentUploadService";
import { getSitePageMediaUrl } from "@/lib/siteContent";
import {
  buildRecruitmentApplicationAttachments,
  buildRecruitmentApplicationAnswers,
  getRecruitmentFieldItems,
  getRecruitmentFieldValueKey,
  hasRecruitmentFieldType,
  isRecruitmentFieldRequired,
  normalizeRecruitmentSettings,
  syncRecruitmentFilesWithFields,
  syncRecruitmentValuesWithFields,
  validateRecruitmentForm,
  type RecruitmentFormFileMap,
} from "@/lib/recruitment";
import {
  DEFAULT_RECRUITMENT_SETTINGS,
  JOB_APPLICATIONS_COLLECTION,
  RECRUITMENT_FILE_CATEGORY,
  RECRUITMENT_SETTINGS_DOC_ID,
  type RecruitmentFormValues,
  type RecruitmentSettingsDoc,
} from "@shared/recruitment";

export default function Careers() {
  const { content } = useSiteContent();
  const [settings, setSettings] = useState<RecruitmentSettingsDoc>(
    DEFAULT_RECRUITMENT_SETTINGS
  );
  const [values, setValues] = useState<RecruitmentFormValues>({});
  const [files, setFiles] = useState<RecruitmentFormFileMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", RECRUITMENT_SETTINGS_DOC_ID),
      (snapshot) => {
        const nextSettings = snapshot.exists()
          ? normalizeRecruitmentSettings(snapshot.data())
          : normalizeRecruitmentSettings(DEFAULT_RECRUITMENT_SETTINGS);

        setSettings(nextSettings);
        setLoading(false);
      },
      (error) => {
        console.error("recruitment settings snapshot error:", error);
        setSettings(normalizeRecruitmentSettings(DEFAULT_RECRUITMENT_SETTINGS));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setValues((current) => syncRecruitmentValuesWithFields(settings.fields, current));
    setFiles((current) => syncRecruitmentFilesWithFields(settings.fields, current));
    setErrors((current) => {
      const validKeys = new Set<string>();

      settings.fields.forEach((field) => {
        getRecruitmentFieldItems(field).forEach((item) => {
          validKeys.add(getRecruitmentFieldValueKey(field, item));
        });
      });

      return Object.fromEntries(
        Object.entries(current).filter(([fieldId]) => validKeys.has(fieldId))
      );
    });
  }, [settings.fields]);

  const totalFieldsCount = settings.fields.length;
  const requiredFieldsCount = useMemo(
    () => settings.fields.filter((field) => isRecruitmentFieldRequired(field)).length,
    [settings.fields]
  );
  const hasFileFields = useMemo(
    () => settings.fields.some((field) => hasRecruitmentFieldType(field, "file")),
    [settings.fields]
  );
  const careersHeroVideo = getSitePageMediaUrl(
    content,
    "careers",
    "careersHeroVideo",
    "/about-hero1.mp4"
  );

  const handleValueChange = (fieldId: string, value: string) => {
    setValues((current) => ({
      ...current,
      [fieldId]: value,
    }));

    setErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  };

  const handleFileChange = (fieldId: string, file: File | null) => {
    setFiles((current) => ({
      ...current,
      [fieldId]: file,
    }));

    setErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!settings.isPublished) {
      toast.error("استقبال طلبات التوظيف غير متاح حاليًا.");
      return;
    }

    const nextErrors = validateRecruitmentForm(settings.fields, values, files);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("يرجى استكمال الحقول المطلوبة قبل إرسال الطلب.");
      return;
    }

    let submitStage: "upload_files" | "save_application" = "upload_files";

    try {
      setSubmitting(true);

      const applicationRef = doc(collection(db, JOB_APPLICATIONS_COLLECTION));
      const uploadedFilesByFieldId: Record<string, UploadDocumentResult> = {};

      for (const field of settings.fields) {
        for (const item of getRecruitmentFieldItems(field)) {
          if (item.type !== "file") continue;

          const valueKey = getRecruitmentFieldValueKey(field, item);
          const selectedFile = files[valueKey] ?? null;
          if (!selectedFile) continue;

          uploadedFilesByFieldId[valueKey] = await uploadDocumentToCloudflare({
            entityType: "career",
            entityId: applicationRef.id,
            category: RECRUITMENT_FILE_CATEGORY,
            file: selectedFile,
            kind: "attachment",
            status: "submitted",
            uploadedBy: "public_careers_page",
            storageFolder: item.fileFolder,
          });
        }
      }

      submitStage = "save_application";
      await setDoc(applicationRef, {
        formId: RECRUITMENT_SETTINGS_DOC_ID,
        status: "submitted",
        source: "public_careers_page",
        fieldsSnapshot: settings.fields,
        answers: buildRecruitmentApplicationAnswers(settings.fields, values),
        attachments: buildRecruitmentApplicationAttachments(
          settings.fields,
          uploadedFilesByFieldId
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setValues(syncRecruitmentValuesWithFields(settings.fields));
      setFiles(syncRecruitmentFilesWithFields(settings.fields));
      setErrors({});
      toast.success("تم استلام طلبك بنجاح، وسنراجعه في أقرب وقت.");
    } catch (error) {
      console.error("job application submit failed:", {
        stage: submitStage,
        error,
      });
      toast.error(
        submitStage === "save_application"
          ? "تم رفع الملفات لكن تعذر حفظ طلب التوظيف حاليًا."
          : "تعذر إرسال الطلب حاليًا. حاول مرة أخرى بعد قليل."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[linear-gradient(180deg,#f5f6f8_0%,#ffffff_20%,#f7f8fa_100%)] text-slate-950"
    >
      <main className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(242,183,5,0.18),transparent_56%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[-8rem] top-[18rem] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(3,6,64,0.08),transparent_68%)] blur-3xl"
        />

        <section className="relative z-10 h-screen min-h-screen min-h-[100svh] overflow-hidden bg-slate-950">
          <div className="absolute inset-0 z-0">
            <video
              key={careersHeroVideo}
              src={careersHeroVideo}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onCanPlay={(event) => {
                const video = event.currentTarget;
                if (video.paused) {
                  void video.play().catch(() => undefined);
                }
              }}
              onLoadedData={(event) => {
                void event.currentTarget.play().catch(() => undefined);
              }}
              onError={event => {
                const video = event.currentTarget;
                if (video.src.endsWith("/about-hero1.mp4")) return;
                video.src = "/about-hero1.mp4";
                video.load();
              }}
            />
          </div>

          <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(7,11,18,0.72)_0%,rgba(7,11,18,0.45)_38%,rgba(7,11,18,0.72)_100%)]" />
          <div className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(circle_at_top,rgba(242,183,5,0.18),transparent_40%)]" />

          <div className="container relative z-10 h-full px-4 sm:px-6">
            <div className="flex h-full items-center justify-center pt-[calc(var(--site-header-offset)+1.5rem)]">
              <div className="mx-auto max-w-4xl text-center text-white">
                <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-[4.25rem]">
                  انضم إلى فريق معدن
                </h1>
              </div>
            </div>
          </div>
        </section>

        <section className="relative py-16 sm:py-20 lg:py-24">
          <div className="container px-4 sm:px-6">
            <div className="mx-auto max-w-4xl text-center">
            </div>
          </div>
        </section>

        <section className="relative pb-20 sm:pb-24">
          <div className="container px-4 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="rounded-[34px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_28px_85px_-56px_rgba(11,23,38,0.28)] sm:p-8">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-6 text-right">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full">
                      {loading ? "جاري التحميل" : `${totalFieldsCount} حقول`}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      {requiredFieldsCount} حقول مطلوبة
                    </Badge>
                    {hasFileFields ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-sky-200 bg-sky-50 text-sky-700"
                      >
                        يدعم المرفقات
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    نموذج التقديم
                  </h2>
                  <p className="text-sm leading-7 text-slate-500">
                    املأ البيانات المطلوبة بدقة. الحقول الإلزامية موضحة بعلامة
                    النجمة، والملفات المطلوبة سترفع مع إرسال الطلب.
                  </p>
                </div>

                {loading ? (
                  <div className="space-y-4 py-8">
                    <div className="h-12 rounded-2xl bg-slate-100" />
                    <div className="h-12 rounded-2xl bg-slate-100" />
                    <div className="h-12 rounded-2xl bg-slate-100" />
                    <div className="h-12 rounded-2xl bg-slate-100" />
                  </div>
                ) : !settings.isPublished ? (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
                      <BriefcaseBusiness className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-950">
                      التوظيف غير متاح حاليًا
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-500">
                      تم إيقاف استقبال الطلبات مؤقتًا من لوحة التحكم.
                    </p>
                  </div>
                ) : !settings.fields.length ? (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
                      <ClipboardCheck className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-950">
                      لا توجد حقول متاحة حاليًا
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-500">
                      سيظهر النموذج هنا فور إضافة الحقول من إعدادات التوظيف داخل
                      الداشبورد.
                    </p>
                  </div>
                ) : (
                  <form className="mt-8 space-y-8" onSubmit={handleSubmit}>
                    <RecruitmentFormFields
                      fields={settings.fields}
                      values={values}
                      files={files}
                      errors={errors}
                      onValueChange={handleValueChange}
                      onFileChange={handleFileChange}
                      disabled={submitting}
                    />

                    <div className="flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm leading-7 text-slate-500">
                        بإرسال الطلب فأنت توافق على تزويدنا بالبيانات والمرفقات
                        المدخلة لغرض مراجعة طلب التوظيف.
                      </p>
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="h-12 rounded-full bg-[#0f172a] px-8 text-sm font-semibold text-white hover:bg-[#111f38]"
                      >
                        {submitting
                          ? hasFileFields
                            ? "جارٍ رفع الملفات وإرسال الطلب..."
                            : "جارٍ الإرسال..."
                          : "إرسال الطلب"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>

              <div className="space-y-5">
                <div className="rounded-[30px] border border-[#0f172a]/10 bg-[linear-gradient(180deg,#0f172a_0%,#13203b_100%)] p-6 text-white shadow-[0_28px_80px_-50px_rgba(15,23,42,0.8)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-[#F2B705]">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white/75">
                        تدفق واضح
                      </div>
                      <div className="mt-1 text-xl font-semibold">
                        نموذج ديناميكي مباشر
                      </div>
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-7 text-white/70">
                    الصفحة تقرأ تعريف الحقول مباشرة من Firestore، بينما تحفظ
                    الملفات عبر Cloudflare Worker وR2 وD1 تحت مسار منفصل خاص
                    بالتوظيف.
                  </p>
                </div>

                <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_22px_70px_-54px_rgba(11,23,38,0.26)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#f7edd7] p-3 text-[#a56d0a]">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-950">
                        كيف يتم التقديم؟
                      </div>
                      <div className="text-sm text-slate-500">
                        ثلاث خطوات بسيطة وواضحة
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4 text-right">
                    {[
                      "راجع الحقول المطلوبة والمرفقات كما تم تحديدها من الإدارة.",
                      "أكمل البيانات بالترتيب وبصيغة صحيحة، وارفع ملفاتك المطلوبة إن وجدت.",
                      "أرسل الطلب وسيتم حفظه ومراجعته من الفريق الإداري.",
                    ].map((item, index) => (
                      <div
                        key={item}
                        className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <p className="text-sm leading-7 text-slate-600">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_22px_70px_-54px_rgba(11,23,38,0.26)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                      <Send className="h-5 w-5" />
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-950">
                        ملخص النموذج الحالي
                      </div>
                      <div className="text-sm text-slate-500">
                        مبني على الإعدادات الحية
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="text-xs font-medium text-slate-500">
                        إجمالي الحقول
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {totalFieldsCount}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="text-xs font-medium text-slate-500">
                        الحقول المطلوبة
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {requiredFieldsCount}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="text-xs font-medium text-slate-500">
                        المرفقات
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {hasFileFields ? "مدعومة" : "غير مطلوبة"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
