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
import { buildR2DownloadUrl } from "@/lib/documentUploadService";
import {
  formatDateTimeEN,
  formatFileSizeEN,
  formatNumberEN,
  toDateSafe,
} from "@/lib/formatters";
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

export default function RecruitmentApplicationsPage() {
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
    <DashboardLayout>
      <div dir="rtl" className="min-h-screen space-y-8 bg-[#F8F9FA] px-1 py-2">
        <Card className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <CardContent className="px-6 py-7 sm:px-8 sm:py-9">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#F2B705]/30 bg-[#F2B705]/10 px-4 py-1.5 text-xs font-semibold text-[#8d6700]">
                  <BriefcaseBusiness className="h-4 w-4" />
                  طلبات التوظيف
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                    إدارة طلبات التوظيف
                  </h1>
                  <p className="max-w-3xl text-sm leading-7 text-slate-600">
                    صفحة مستقلة لطلبات التوظيف القادمة من صفحة{" "}
                    <span dir="ltr">/careers</span>، مع عرض أوضح للقائمة،
                    وبيانات المتقدم، والمرفقات داخل مساحة أكثر توازنًا وراحة
                    للمراجعة اليومية.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <SummaryPill
                    label="إجمالي الطلبات"
                    value={formatNumberEN(applications.length)}
                    helper="كل الطلبات المستلمة"
                  />
                  <SummaryPill
                    label="بمرفقات"
                    value={formatNumberEN(withAttachmentsCount)}
                    helper="طلبات تحتوي على ملفات"
                  />
                  <SummaryPill
                    label="آخر طلب"
                    value={
                      latestSubmissionAt
                        ? formatDateTimeEN(latestSubmissionAt)
                        : "—"
                    }
                    helper="أحدث تاريخ تقديم"
                  />
                </div>
              </div>

              <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.2em] text-white/45">
                      الحالة
                    </p>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight">
                      لوحة مراجعة مستقلة
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
                  القراءة من <span dir="ltr">job_applications</span>، والملفات
                  المرفوعة محفوظة بمسار مستقل تحت{" "}
                  <span dir="ltr">careers/</span>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm xl:sticky xl:top-6 xl:self-start">
            <CardHeader className="border-b border-slate-100 bg-white px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-semibold tracking-tight text-slate-950">
                    قائمة الطلبات
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
                    قائمة مختصرة لاختيار الطلب فقط. تظهر التفاصيل الكاملة في لوحة المراجعة.
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
                  title="لا توجد طلبات توظيف حتى الآن"
                  description="ستظهر هنا الطلبات الجديدة فور إرسالها من صفحة التوظيف العامة."
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
                  تفاصيل الطلب
                </CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
                  ملخص واضح للمتقدم والحقول الأساسية دون تكرار معلومات القائمة.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 sm:p-7">
                {!selectedApplication || !selectedSummary ? (
                  <EmptyState
                    title="اختر طلبًا من القائمة"
                    description="عند اختيار أحد الطلبات ستظهر هنا جميع البيانات والمرفقات بشكل منظم وواضح."
                  />
                ) : (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-slate-100 bg-[#F8F9FA] p-6 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                        <Badge className="rounded-full bg-slate-900 text-white hover:bg-slate-900">
                          الطلب المحدد
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white/80"
                        >
                          {formatNumberEN(selectedAnswers.length)} حقل
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white/80"
                        >
                          {formatNumberEN(selectedAttachments.length)} مرفقات
                        </Badge>
                          </div>
                          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
                            {selectedSummary.fullName}
                          </h2>
                        </div>
                        <InfoTile
                          label="رقم الطلب"
                          value={selectedApplication.id}
                          monospace
                          compact
                        />
                      </div>

                      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <SelectedOverviewRow
                          icon={Phone}
                          label="الجوال"
                          value={selectedSummary.phone}
                        />
                        <SelectedOverviewRow
                          icon={ShieldCheck}
                          label="التعليم"
                          value={selectedSummary.education}
                        />
                        <SelectedOverviewRow
                          icon={CalendarDays}
                          label="تاريخ التقديم"
                          value={selectedCreatedAtLabel}
                        />
                        <SelectedOverviewRow
                          icon={Paperclip}
                          label="المرفقات"
                          value={
                            selectedAttachments.length
                              ? `${formatNumberEN(selectedAttachments.length)} ملف`
                              : "بدون مرفقات"
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
                      بيانات المتقدم
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
                      شبكة بيانات خفيفة لقراءة كل إجابات النموذج بدون بطاقات ضخمة.
                    </CardDescription>
                  </div>
                  {selectedApplication ? (
                    <Badge variant="outline" className="rounded-full">
                      {formatNumberEN(selectedAnswers.length)} حقل
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-6 sm:p-7">
                {!selectedApplication ? (
                  <EmptyState
                    title="بيانات المتقدم ستظهر هنا"
                    description="اختر طلبًا من القائمة لعرض جميع الإجابات المرتبطة به."
                    compact
                  />
                ) : selectedAnswers.length ? (
                  <div className="grid overflow-hidden rounded-2xl border border-slate-100 bg-white md:grid-cols-2 2xl:grid-cols-3">
                    {selectedAnswers.map(answer => (
                      <AnswerCard
                        key={`${answer.fieldId}-${answer.order}`}
                        answer={answer}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="لا توجد بيانات محفوظة داخل هذا الطلب"
                    description="لم يتم العثور على إجابات محفوظة لهذا المتقدم."
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
                      المرفقات
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
                      ملفات الطلب مع إجراءات المعاينة والتحميل في صفوف واضحة.
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
                    title="المرفقات ستظهر هنا"
                    description="اختر طلبًا من القائمة لعرض الملفات المرتبطة به."
                    compact
                  />
                ) : selectedAttachments.length ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {selectedAttachments.map(attachment => (
                      <AttachmentCard
                        key={`${attachment.fieldId}-${attachment.fileId}`}
                        attachment={attachment}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="لا توجد مرفقات مرفوعة مع هذا الطلب"
                    description="تم إرسال هذا الطلب بدون ملفات مرفقة."
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
  onSelect,
}: {
  application: RecruitmentApplicationRecord;
  summary: ReturnType<typeof getApplicationSummary>;
  attachmentsCount: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={cn(
        "w-full rounded-2xl border p-4 text-right transition-all",
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
              {summary.fullName}
            </div>
            {isActive ? (
              <Badge className="rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/10">
                المحدد
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
            المرفقات
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

function AnswerCard({ answer }: { answer: RecruitmentApplicationAnswer }) {
  return (
    <div className="min-h-28 border-b border-l border-slate-100 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{answer.label}</div>
      <div className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-950">
        {getAnswerDisplayValue(answer)}
      </div>
    </div>
  );
}

function AttachmentCard({
  attachment,
}: {
  attachment: RecruitmentApplicationAttachment;
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
              <span className="truncate font-semibold">{attachment.label}</span>
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
          <AttachmentMetaBadge label={attachment.contentType || "بدون نوع"} />
          <AttachmentMetaBadge label={attachment.storageFolder} ltr />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {viewUrl ? (
          <Button asChild variant="outline" size="sm" className="rounded-full border-slate-200 bg-white">
            <a href={viewUrl} target="_blank" rel="noreferrer">
              <Eye className="ml-2 h-4 w-4" />
              معاينة
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
              <Download className="ml-2 h-4 w-4" />
              تحميل
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
