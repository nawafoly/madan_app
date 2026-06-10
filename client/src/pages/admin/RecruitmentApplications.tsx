import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  BriefcaseBusiness,
  CalendarDays,
  Download,
  Eye,
  FileText,
  Paperclip,
  Phone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/_core/firebase";
import { useLanguage, type Language } from "@/contexts/LanguageContext";
import { buildR2DownloadUrl } from "@/lib/documentUploadService";
import {
  formatDateTimeEN,
  formatFileSizeEN,
  formatNumberEN,
  toDateSafe,
} from "@/lib/formatters";
import { languageDir, safeEnglishText, textAlignClass, tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  JOB_APPLICATIONS_COLLECTION,
  type RecruitmentApplicationAnswer,
  type RecruitmentApplicationAttachment,
  type RecruitmentApplicationDoc,
} from "@shared/recruitment";

type RecruitmentApplicationRecord = RecruitmentApplicationDoc & {
  id: string;
};

function getAnswerDisplayValue(answer?: RecruitmentApplicationAnswer | null) {
  if (!answer) return "—";
  return String(answer.valueLabel || answer.value || "").trim() || "—";
}

function normalizeAnswerLabel(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function findAnswer(
  answers: RecruitmentApplicationAnswer[],
  preferredFieldIds: string[],
  labelKeywords: string[]
) {
  const byFieldId = answers.find(answer =>
    preferredFieldIds.includes(answer.fieldId)
  );
  if (byFieldId) return byFieldId;

  return answers.find(answer =>
    labelKeywords.some(keyword =>
      normalizeAnswerLabel(answer.label).includes(keyword)
    )
  );
}

function getApplicationSummary(application: RecruitmentApplicationRecord) {
  const answers = [...(application.answers || [])].sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  );

  return {
    fullName: getAnswerDisplayValue(
      findAnswer(answers, ["full_name", "name"], ["الاسم", "name"])
    ),
    phone: getAnswerDisplayValue(
      findAnswer(
        answers,
        ["phone_number", "phone", "mobile"],
        ["الجوال", "الهاتف", "phone"]
      )
    ),
    education: getAnswerDisplayValue(
      findAnswer(
        answers,
        ["education_type", "education", "education_level"],
        ["التعليم", "education"]
      )
    ),
  };
}

function formatApplicationDate(value: unknown) {
  const date = toDateSafe(value);
  return date ? formatDateTimeEN(date) : "—";
}

function getAttachmentTypeLabel(attachment: RecruitmentApplicationAttachment) {
  const contentType = String(attachment.contentType || "").trim();
  if (contentType) {
    const [, subtype] = contentType.split("/");
    return subtype ? subtype.toUpperCase() : contentType.toUpperCase();
  }

  const fileName = String(attachment.fileName || "").trim();
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";

  return extension ? extension.toUpperCase() : "FILE";
}

const ANSWER_LABEL_FALLBACKS: Record<string, string> = {
  full_name: "Full Name",
  name: "Full Name",
  phone_number: "Mobile",
  phone: "Mobile",
  mobile: "Mobile",
  education_type: "Education",
  education: "Education",
  education_level: "Education",
  email: "Email",
  city: "City",
  nationality: "Nationality",
  experience: "Experience",
  job_title: "Job Title",
  position: "Position",
  cv: "CV",
  resume: "Resume",
};

function displayDataValue(
  language: Language,
  value: unknown,
  fallback: string
) {
  const raw = String(value ?? "").trim();
  if (language === "ar") return raw || fallback;
  return safeEnglishText(raw, fallback);
}

function displayAnswerLabel(
  language: Language,
  answer: RecruitmentApplicationAnswer
) {
  if (language === "ar") return String(answer.label || "").trim() || "حقل";
  return (
    ANSWER_LABEL_FALLBACKS[answer.fieldId] ||
    safeEnglishText(answer.label, "Field")
  );
}

function displayAttachmentLabel(
  language: Language,
  attachment: RecruitmentApplicationAttachment
) {
  if (language === "ar") return String(attachment.label || "").trim() || "مرفق";
  return safeEnglishText(attachment.label, "Attachment");
}

export default function RecruitmentApplicationsPage() {
  const { language } = useLanguage();
  const pageDir = languageDir(language);
  const pageTextAlignClass = textAlignClass(language);
  const [applications, setApplications] = useState<
    RecruitmentApplicationRecord[]
  >([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applicationsQuery = query(
      collection(db, JOB_APPLICATIONS_COLLECTION),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      applicationsQuery,
      snapshot => {
        const nextApplications = snapshot.docs.map(docSnapshot => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as RecruitmentApplicationDoc),
        }));

        setApplications(nextApplications);
        setSelectedId(current => {
          if (current && nextApplications.some(item => item.id === current)) {
            return current;
          }
          return nextApplications[0]?.id || "";
        });
        setLoading(false);
      },
      error => {
        console.error("recruitment applications snapshot error:", error);
        setApplications([]);
        setSelectedId("");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const selectedApplication = useMemo(
    () => applications.find(item => item.id === selectedId) || null,
    [applications, selectedId]
  );

  const withAttachmentsCount = useMemo(
    () =>
      applications.filter(item => (item.attachments || []).length > 0).length,
    [applications]
  );

  const latestSubmissionAt = useMemo(
    () => toDateSafe(applications[0]?.createdAt),
    [applications]
  );

  const selectedAnswers = useMemo(
    () =>
      [...(selectedApplication?.answers || [])].sort(
        (a, b) => Number(a.order || 0) - Number(b.order || 0)
      ),
    [selectedApplication]
  );

  const selectedAttachments = useMemo(
    () =>
      [...(selectedApplication?.attachments || [])].sort(
        (a, b) => Number(a.order || 0) - Number(b.order || 0)
      ),
    [selectedApplication]
  );

  const selectedSummary = useMemo(
    () =>
      selectedApplication ? getApplicationSummary(selectedApplication) : null,
    [selectedApplication]
  );

  const selectedCreatedAtLabel = useMemo(
    () => formatApplicationDate(selectedApplication?.createdAt),
    [selectedApplication]
  );

  return (
    <DashboardLayout area="hr">
      <div
        dir={pageDir}
        className={cn(
          "min-h-screen space-y-8 bg-[#F8F9FA] px-1 py-2",
          pageTextAlignClass
        )}
      >
        <Card className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <CardContent className="px-6 py-7 sm:px-8 sm:py-9">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#F2B705]/30 bg-[#F2B705]/10 px-4 py-1.5 text-xs font-semibold text-[#8d6700]">
                  <BriefcaseBusiness className="h-4 w-4" />
                  {tr(language, "طلبات التوظيف", "Recruitment Applications")}
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                    {tr(language, "إدارة طلبات التوظيف", "Recruitment Management")}
                  </h1>
                  <p className="max-w-3xl text-sm leading-7 text-slate-600">
                    {tr(
                      language,
                      "صفحة مستقلة لطلبات التوظيف القادمة من صفحة",
                      "A dedicated page for job applications submitted through"
                    )}{" "}
                    <span dir="ltr">/careers</span>
                    {tr(
                      language,
                      "، مع عرض أوضح للقائمة، وبيانات المتقدم، والمرفقات داخل مساحة أكثر توازنًا وراحة للمراجعة اليومية.",
                      ", with a clearer list, applicant details, and attachments in a balanced review workspace."
                    )}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <SummaryPill
                    label={tr(language, "إجمالي الطلبات", "Total Applications")}
                    value={formatNumberEN(applications.length)}
                    helper={tr(language, "كل الطلبات المستلمة", "All received applications")}
                  />
                  <SummaryPill
                    label={tr(language, "بمرفقات", "With Attachments")}
                    value={formatNumberEN(withAttachmentsCount)}
                    helper={tr(language, "طلبات تحتوي على ملفات", "Applications that include files")}
                  />
                  <SummaryPill
                    label={tr(language, "آخر طلب", "Latest Application")}
                    value={
                      latestSubmissionAt
                        ? formatDateTimeEN(latestSubmissionAt)
                        : "-"
                    }
                    helper={tr(language, "أحدث تاريخ تقديم", "Most recent submission date")}
                  />
                </div>
              </div>

              <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.2em] text-white/45">
                      {tr(language, "الحالة", "Status")}
                    </p>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight">
                      {tr(language, "لوحة مراجعة مستقلة", "Independent Review Board")}
                    </h3>
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80 shadow-none"
                  >
                    Job Applications
                  </Badge>
                </div>
                <p className="mt-4 text-sm leading-7 text-white/60">
                  {tr(language, "القراءة من", "Reads from")}{" "}
                  <span dir="ltr">job_applications</span>
                  {tr(
                    language,
                    "، والملفات المرفوعة محفوظة بمسار مستقل تحت",
                    ", and uploaded files are stored under"
                  )}{" "}
                  <span dir="ltr">careers/</span>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="min-h-[420px] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm xl:sticky xl:top-6 xl:self-start">
            <CardHeader className="border-b border-slate-100 bg-white px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-semibold tracking-tight text-slate-950">
                    {tr(language, "قائمة الطلبات", "Application List")}
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
                    {tr(
                      language,
                      "قائمة مختصرة لاختيار الطلب فقط. تظهر التفاصيل الكاملة في لوحة المراجعة.",
                      "A compact list for selecting an application. Full details appear in the review panel."
                    )}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50">
                  {formatNumberEN(applications.length)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-24 rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : applications.length === 0 ? (
                <EmptyState
                  title={tr(language, "لا توجد طلبات توظيف حتى الآن", "No Job Applications Yet")}
                  description={tr(
                    language,
                    "ستظهر هنا الطلبات الجديدة فور إرسالها من صفحة التوظيف العامة.",
                    "New applications will appear here as soon as they are submitted from the public careers page."
                  )}
                  compact
                />
              ) : (
                <div className="space-y-3 xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto xl:pl-1">
                  {applications.map(application => {
                    const summary = getApplicationSummary(application);
                    const attachmentsCount =
                      application.attachments?.length || 0;
                    const isActive = application.id === selectedId;

                    return (
                      <ApplicationListItem
                        key={application.id}
                        application={application}
                        summary={summary}
                        attachmentsCount={attachmentsCount}
                        isActive={isActive}
                        language={language}
                        onSelect={() => setSelectedId(application.id)}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-8">
            <Card className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-white px-6 py-5">
                <CardTitle className="text-xl font-semibold tracking-tight text-slate-950">
                  {tr(language, "تفاصيل الطلب", "Application Details")}
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
                  {tr(
                    language,
                    "ملخص واضح للمتقدم والحقول الأساسية دون تكرار معلومات القائمة.",
                    "A clear summary of the applicant and core fields without repeating list details."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 sm:p-7">
                {!selectedApplication || !selectedSummary ? (
                  <EmptyState
                    title={tr(language, "اختر طلبًا من القائمة", "Select an Application")}
                    description={tr(
                      language,
                      "عند اختيار أحد الطلبات ستظهر هنا جميع البيانات والمرفقات بشكل منظم وواضح.",
                      "When you select an application, its details and attachments will appear here in an organized view."
                    )}
                  />
                ) : (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-slate-100 bg-[#F8F9FA] p-6 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                        <Badge className="rounded-full bg-slate-900 text-white hover:bg-slate-900">
                          {tr(language, "الطلب المحدد", "Selected Application")}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white/80"
                        >
                          {formatNumberEN(selectedAnswers.length)}{" "}
                          {tr(language, "حقل", "fields")}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white/80"
                        >
                          {formatNumberEN(selectedAttachments.length)}{" "}
                          {tr(language, "مرفقات", "attachments")}
                        </Badge>
                          </div>
                          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
                            {displayDataValue(language, selectedSummary.fullName, "Applicant")}
                          </h2>
                        </div>
                        <InfoTile
                          label={tr(language, "رقم الطلب", "Application ID")}
                          value={selectedApplication.id}
                          monospace
                          compact
                        />
                      </div>

                      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <SelectedOverviewRow
                          icon={Phone}
                          label={tr(language, "الجوال", "Mobile")}
                          value={displayDataValue(language, selectedSummary.phone, "Not provided")}
                        />
                        <SelectedOverviewRow
                          icon={ShieldCheck}
                          label={tr(language, "التعليم", "Education")}
                          value={displayDataValue(language, selectedSummary.education, "Not specified")}
                        />
                        <SelectedOverviewRow
                          icon={CalendarDays}
                          label={tr(language, "تاريخ التقديم", "Submission Date")}
                          value={selectedCreatedAtLabel}
                        />
                        <SelectedOverviewRow
                          icon={Paperclip}
                          label={tr(language, "المرفقات", "Attachments")}
                          value={
                            selectedAttachments.length
                              ? `${formatNumberEN(selectedAttachments.length)} ${tr(language, "ملف", "files")}`
                              : tr(language, "بدون مرفقات", "No attachments")
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-white px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-semibold tracking-tight text-slate-950">
                      {tr(language, "بيانات المتقدم", "Applicant Data")}
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
                      {tr(
                        language,
                        "شبكة بيانات خفيفة لقراءة كل إجابات النموذج بدون بطاقات ضخمة.",
                        "A compact data grid for reading all form answers without oversized cards."
                      )}
                    </CardDescription>
                  </div>
                  {selectedApplication ? (
                    <Badge variant="outline" className="rounded-full">
                      {formatNumberEN(selectedAnswers.length)}{" "}
                      {tr(language, "حقل", "fields")}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-6 sm:p-7">
                {!selectedApplication ? (
                  <EmptyState
                    title={tr(language, "بيانات المتقدم ستظهر هنا", "Applicant Data Will Appear Here")}
                    description={tr(
                      language,
                      "اختر طلبًا من القائمة لعرض جميع الإجابات المرتبطة به.",
                      "Select an application from the list to view all related answers."
                    )}
                    compact
                  />
                ) : selectedAnswers.length ? (
                  <div className="grid overflow-hidden rounded-2xl border border-slate-100 bg-white md:grid-cols-2 2xl:grid-cols-3">
                    {selectedAnswers.map(answer => (
                      <AnswerCard
                        key={`${answer.fieldId}-${answer.order}`}
                        answer={answer}
                        language={language}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={tr(language, "لا توجد بيانات محفوظة داخل هذا الطلب", "No Saved Data in This Application")}
                    description={tr(
                      language,
                      "لم يتم العثور على إجابات محفوظة لهذا المتقدم.",
                      "No saved answers were found for this applicant."
                    )}
                    compact
                  />
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-white px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-semibold tracking-tight text-slate-950">
                      {tr(language, "المرفقات", "Attachments")}
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
                      {tr(
                        language,
                        "ملفات الطلب مع إجراءات المعاينة والتحميل في صفوف واضحة.",
                        "Application files with clear preview and download actions."
                      )}
                    </CardDescription>
                  </div>
                  {selectedApplication ? (
                    <Badge variant="outline" className="rounded-full">
                      {formatNumberEN(selectedAttachments.length)}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-6 sm:p-7">
                {!selectedApplication ? (
                  <EmptyState
                    title={tr(language, "المرفقات ستظهر هنا", "Attachments Will Appear Here")}
                    description={tr(
                      language,
                      "اختر طلبًا من القائمة لعرض الملفات المرتبطة به.",
                      "Select an application from the list to view its files."
                    )}
                    compact
                  />
                ) : selectedAttachments.length ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {selectedAttachments.map(attachment => (
                      <AttachmentCard
                        key={`${attachment.fieldId}-${attachment.fileId}`}
                        attachment={attachment}
                        language={language}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={tr(language, "لا توجد مرفقات مرفوعة مع هذا الطلب", "No Attachments for This Application")}
                    description={tr(
                      language,
                      "تم إرسال هذا الطلب بدون ملفات مرفقة.",
                      "This application was submitted without attached files."
                    )}
                    compact
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ApplicationListItem({
  application,
  summary,
  attachmentsCount,
  isActive,
  language,
  onSelect,
}: {
  application: RecruitmentApplicationRecord;
  summary: ReturnType<typeof getApplicationSummary>;
  attachmentsCount: number;
  isActive: boolean;
  language: Language;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={cn(
        "w-full rounded-2xl border p-4 transition-all",
        language === "ar" ? "text-right" : "text-left",
        isActive
          ? "border-slate-900 bg-slate-950 text-white shadow-md"
          : "border-slate-100 bg-white text-slate-900 shadow-sm hover:border-slate-200 hover:bg-slate-50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={cn(
                "truncate text-base font-semibold",
                isActive ? "text-white" : "text-slate-950"
              )}
            >
              {displayDataValue(language, summary.fullName, "Applicant")}
            </div>
            {isActive ? (
              <Badge className="rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/10">
                {tr(language, "المحدد", "Selected")}
              </Badge>
            ) : null}
          </div>
          <div
            className={cn(
              "mt-3 flex items-center gap-2 text-xs",
              isActive ? "text-white/60" : "text-slate-500"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{formatApplicationDate(application.createdAt)}</span>
          </div>
          <div
            className={cn(
              "mt-2 max-w-[230px] truncate text-xs font-medium",
              isActive ? "text-white/80" : "text-slate-600"
            )}
          >
            {application.id}
          </div>
        </div>

        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-center",
            isActive
              ? "border border-white/10 bg-white/10"
              : attachmentsCount > 0
                ? "border border-emerald-200 bg-emerald-50"
                : "border border-slate-200 bg-white"
          )}
        >
          <div
            className={cn(
              "text-[11px] font-medium",
              isActive
                ? "text-white/60"
                : attachmentsCount > 0
                  ? "text-emerald-700"
                  : "text-slate-500"
            )}
          >
            {tr(language, "المرفقات", "Attachments")}
          </div>
          <div
            className={cn(
              "mt-1 text-sm font-semibold",
              isActive
                ? "text-white"
                : attachmentsCount > 0
                  ? "text-emerald-700"
                  : "text-slate-700"
            )}
          >
            {attachmentsCount > 0 ? formatNumberEN(attachmentsCount) : "0"}
          </div>
        </div>
      </div>
    </button>
  );
}

function SummaryPill({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-500">{helper}</div>
    </div>
  );
}

function SelectedOverviewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  monospace = false,
  compact = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-100 bg-white shadow-sm",
        compact ? "max-w-full px-4 py-3" : "p-4"
      )}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-3 text-sm font-semibold text-slate-950",
          monospace ? "break-all font-mono text-[13px]" : ""
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AnswerCard({
  answer,
  language,
}: {
  answer: RecruitmentApplicationAnswer;
  language: Language;
}) {
  return (
    <div className="min-h-28 border-b border-l border-slate-100 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">
        {displayAnswerLabel(language, answer)}
      </div>
      <div className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-950">
        {displayDataValue(language, getAnswerDisplayValue(answer), "Not provided")}
      </div>
    </div>
  );
}

function AttachmentCard({
  attachment,
  language,
}: {
  attachment: RecruitmentApplicationAttachment;
  language: Language;
}) {
  const viewUrl =
    String(attachment.fileUrl || "").trim() ||
    buildR2DownloadUrl(attachment.filePath, false);
  const downloadUrl = buildR2DownloadUrl(attachment.filePath, true) || viewUrl;

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-slate-950">
              <div className="rounded-xl bg-slate-50 p-2 text-slate-700">
                <Paperclip className="h-4 w-4" />
              </div>
              <span className="truncate font-semibold">
                {displayAttachmentLabel(language, attachment)}
              </span>
            </div>
            <div className="break-all text-sm text-slate-600">
              {attachment.fileName}
            </div>
          </div>

          <Badge variant="outline" className="rounded-full bg-white">
            {getAttachmentTypeLabel(attachment)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <AttachmentMetaBadge label={formatFileSizeEN(attachment.fileSize)} />
          <AttachmentMetaBadge
            label={attachment.contentType || tr(language, "بدون نوع", "No type")}
          />
          <AttachmentMetaBadge label={attachment.storageFolder} ltr />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {viewUrl ? (
          <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-white">
            <a href={viewUrl} target="_blank" rel="noreferrer">
              <Eye className={cn("h-4 w-4", language === "ar" ? "ml-2" : "mr-2")} />
              {tr(language, "معاينة", "Preview")}
            </a>
          </Button>
        ) : null}

        {downloadUrl ? (
          <Button asChild size="sm" className="rounded-full">
            <a
              href={downloadUrl}
              rel="noreferrer"
              download={attachment.fileName || true}
            >
              <Download className={cn("h-4 w-4", language === "ar" ? "ml-2" : "mr-2")} />
              {tr(language, "تحميل", "Download")}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentMetaBadge({
  label,
  ltr = false,
}: {
  label: string;
  ltr?: boolean;
}) {
  return (
    <span
      dir={ltr ? "ltr" : undefined}
      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600"
    >
      {label}
    </span>
  );
}

function EmptyState({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-6 text-center",
        compact ? "py-10" : "py-14"
      )}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
        <FileText className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-500">{description}</p>
    </div>
  );
}
