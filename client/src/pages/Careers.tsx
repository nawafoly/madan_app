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
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
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
  const { language } = useLanguage();
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
      toast.error(
        tr(
          language,
          "استقبال طلبات التوظيف غير متاح حاليًا.",
          "Job applications are not available right now."
        )
      );
      return;
    }

    const nextErrors = validateRecruitmentForm(settings.fields, values, files);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error(
        tr(
          language,
          "يرجى استكمال الحقول المطلوبة قبل إرسال الطلب.",
          "Complete the required fields before submitting."
        )
      );
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
      toast.success(
        tr(
          language,
          "تم استلام طلبك بنجاح، وسنراجعه في أقرب وقت.",
          "Your application was received and will be reviewed soon."
        )
      );
    } catch (error) {
      console.error("job application submit failed:", {
        stage: submitStage,
        error,
      });
      toast.error(
        submitStage === "save_application"
          ? tr(
              language,
              "تم رفع الملفات لكن تعذر حفظ طلب التوظيف حاليًا.",
              "Files were uploaded, but the application could not be saved right now."
            )
          : tr(
              language,
              "تعذر إرسال الطلب حاليًا. حاول مرة أخرى بعد قليل.",
              "The application could not be submitted right now. Try again shortly."
            )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={languageDir(language)}
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
                  {tr(language, "انضم إلى فريق معدن", "Join The MAEDIN Team")}
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
                      {loading
                        ? tr(language, "جاري التحميل", "Loading")
                        : tr(
                            language,
                            `${totalFieldsCount} حقول`,
                            `${totalFieldsCount} fields`
                          )}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      {tr(
                        language,
                        `${requiredFieldsCount} حقول مطلوبة`,
                        `${requiredFieldsCount} required fields`
                      )}
                    </Badge>
                    {hasFileFields ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-sky-200 bg-sky-50 text-sky-700"
                      >
                        {tr(language, "يدعم المرفقات", "Supports attachments")}
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    {tr(language, "نموذج التقديم", "Application Form")}
                  </h2>
                  <p className="text-sm leading-7 text-slate-500">
                    {tr(
                      language,
                      "املأ البيانات المطلوبة بدقة. الحقول الإلزامية موضحة بعلامة النجمة، والملفات المطلوبة سترفع مع إرسال الطلب.",
                      "Fill in the required information accurately. Required fields are marked, and required files will be uploaded with your application."
                    )}
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
                      {tr(language, "التوظيف غير متاح حاليًا", "Careers Are Currently Closed")}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-500">
                      {tr(
                        language,
                        "تم إيقاف استقبال الطلبات مؤقتًا من لوحة التحكم.",
                        "Application intake has been temporarily disabled from the dashboard."
                      )}
                    </p>
                  </div>
                ) : !settings.fields.length ? (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
                      <ClipboardCheck className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-950">
                      {tr(language, "لا توجد حقول متاحة حاليًا", "No Fields Are Available")}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-500">
                      {tr(
                        language,
                        "سيظهر النموذج هنا فور إضافة الحقول من إعدادات التوظيف داخل الداشبورد.",
                        "The form will appear here once fields are added from recruitment settings."
                      )}
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
                        {tr(
                          language,
                          "بإرسال الطلب فأنت توافق على تزويدنا بالبيانات والمرفقات المدخلة لغرض مراجعة طلب التوظيف.",
                          "By submitting, you agree to provide the entered information and attachments for application review."
                        )}
                      </p>
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="h-12 rounded-full bg-[#0f172a] px-8 text-sm font-semibold text-white hover:bg-[#111f38]"
                      >
                        {submitting
                          ? hasFileFields
                            ? tr(
                                language,
                                "جارٍ رفع الملفات وإرسال الطلب...",
                                "Uploading files and submitting..."
                              )
                            : tr(language, "جارٍ الإرسال...", "Submitting...")
                          : tr(language, "إرسال الطلب", "Submit Application")}
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
                        {tr(language, "تدفق واضح", "Clear Flow")}
                      </div>
                      <div className="mt-1 text-xl font-semibold">
                        {tr(language, "نموذج ديناميكي مباشر", "Live Dynamic Form")}
                      </div>
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-7 text-white/70">
                    {tr(
                      language,
                      "الصفحة تقرأ تعريف الحقول مباشرة من Firestore، بينما تحفظ الملفات عبر Cloudflare Worker وR2 وD1 تحت مسار منفصل خاص بالتوظيف.",
                      "This page reads field definitions directly from Firestore, while files are stored through Cloudflare Worker, R2, and D1 under a dedicated careers path."
                    )}
                  </p>
                </div>

                <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_22px_70px_-54px_rgba(11,23,38,0.26)]">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#f7edd7] p-3 text-[#a56d0a]">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-950">
                        {tr(language, "كيف يتم التقديم؟", "How To Apply")}
                      </div>
                      <div className="text-sm text-slate-500">
                        {tr(language, "ثلاث خطوات بسيطة وواضحة", "Three simple steps")}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4 text-right">
                    {[
                      tr(
                        language,
                        "راجع الحقول المطلوبة والمرفقات كما تم تحديدها من الإدارة.",
                        "Review the required fields and attachments defined by the team."
                      ),
                      tr(
                        language,
                        "أكمل البيانات بالترتيب وبصيغة صحيحة، وارفع ملفاتك المطلوبة إن وجدت.",
                        "Complete the information correctly and upload any required files."
                      ),
                      tr(
                        language,
                        "أرسل الطلب وسيتم حفظه ومراجعته من الفريق الإداري.",
                        "Submit the application so the administrative team can review it."
                      ),
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
                        {tr(language, "ملخص النموذج الحالي", "Current Form Summary")}
                      </div>
                      <div className="text-sm text-slate-500">
                        {tr(language, "مبني على الإعدادات الحية", "Based on live settings")}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="text-xs font-medium text-slate-500">
                        {tr(language, "إجمالي الحقول", "Total Fields")}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {totalFieldsCount}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="text-xs font-medium text-slate-500">
                        {tr(language, "الحقول المطلوبة", "Required Fields")}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {requiredFieldsCount}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="text-xs font-medium text-slate-500">
                        {tr(language, "المرفقات", "Attachments")}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {hasFileFields
                          ? tr(language, "مدعومة", "Supported")
                          : tr(language, "غير مطلوبة", "Not Required")}
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
