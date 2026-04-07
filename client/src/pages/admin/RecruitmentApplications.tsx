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
      <div dir="rtl" className="space-y-6">
        <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] shadow-[0_28px_72px_-52px_rgba(15,23,42,0.28)]">
          <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#F2B705]/30 bg-[#F2B705]/12 px-4 py-1.5 text-xs font-semibold text-[#8d6700]">
                  <BriefcaseBusiness className="h-4 w-4" />
                  طلبات التوظيف
                </div>
                <div className="space-y-3">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                    إدارة طلبات التوظيف
                  </h1>
                  <p className="max-w-3xl text-sm leading-7 text-slate-600">
                    صفحة مستقلة لطلبات التوظيف القادمة من صفحة{" "}
                    <span dir="ltr">/careers</span>، مع عرض أوضح للقائمة،
                    وبيانات المتقدم، والمرفقات داخل مساحة أكثر توازنًا وراحة
                    للمراجعة اليومية.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
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

              <div className="rounded-[28px] border border-[#1e3358] bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_28px_60px_-42px_rgba(2,6,23,0.85)]">
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

        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)] xl:sticky xl:top-6 xl:self-start">
            <CardHeader className="border-b border-slate-100/80 pb-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                    قائمة الطلبات
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-7 text-slate-600">
                    بطاقات مضغوطة وواضحة لاسم المتقدم والجوال والتعليم والتاريخ
                    والمرفقات مع إبراز مباشر للطلب المحدد.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="rounded-full">
                  {formatNumberEN(applications.length)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-4">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-32 rounded-[24px] bg-slate-100"
                    />
                  ))}
                </div>
              ) : applications.length === 0 ? (
                <EmptyState
                  title="لا توجد طلبات توظيف حتى الآن"
                  description="ستظهر هنا الطلبات الجديدة فور إرسالها من صفحة التوظيف العامة."
                  compact
                />
              ) : (
                <div className="space-y-3 xl:max-h-[calc(100vh-15.5rem)] xl:overflow-y-auto xl:pl-1">
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

          <div className="space-y-6">
            <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="border-b border-slate-100/80 pb-5">
                <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                  تفاصيل الطلب
                </CardTitle>
                <CardDescription className="text-sm leading-7 text-slate-600">
                  رأس مختصر للطلب المحدد مع حقول المتقدم كاملة، ثم قسم مستقل
                  وواضح للمرفقات والمعاينة والتحميل.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {!selectedApplication || !selectedSummary ? (
                  <EmptyState
                    title="اختر طلبًا من القائمة"
                    description="عند اختيار أحد الطلبات ستظهر هنا جميع البيانات والمرفقات بشكل منظم وواضح."
                  />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_58%,#eef2ff_100%)] p-6">
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
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        مساحة مراجعة مريحة تعرض البيانات الأساسية أولًا ثم بقية
                        الحقول والمرفقات بدون تزاحم.
                      </p>

                      <div className="mt-6 grid gap-3 md:grid-cols-2">
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

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <InfoTile
                        label="رقم الطلب"
                        value={selectedApplication.id}
                        monospace
                      />
                      <InfoTile
                        label="عدد الحقول"
                        value={formatNumberEN(selectedAnswers.length)}
                      />
                      <InfoTile
                        label="حالة المرفقات"
                        value={
                          selectedAttachments.length ? "مرفقة" : "غير مرفقة"
                        }
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="border-b border-slate-100/80 pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-[1.05rem] font-semibold tracking-tight text-slate-950">
                      بيانات المتقدم
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm leading-7 text-slate-600">
                      عرض الحقول على شبكة أوسع ومسافات داخلية أوضح بدل التكدس
                      العمودي السابق.
                    </CardDescription>
                  </div>
                  {selectedApplication ? (
                    <Badge variant="outline" className="rounded-full">
                      {formatNumberEN(selectedAnswers.length)} حقل
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {!selectedApplication ? (
                  <EmptyState
                    title="بيانات المتقدم ستظهر هنا"
                    description="اختر طلبًا من القائمة لعرض جميع الإجابات المرتبطة به."
                    compact
                  />
                ) : selectedAnswers.length ? (
                  <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
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

            <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
              <CardHeader className="border-b border-slate-100/80 pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-[1.05rem] font-semibold tracking-tight text-slate-950">
                      المرفقات
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm leading-7 text-slate-600">
                      اسم الملف ونوعه وحجمه وأزرار المعاينة والتحميل داخل بطاقات
                      مستقلة ومريحة بصريًا.
                    </CardDescription>
                  </div>
                  {selectedApplication ? (
                    <Badge variant="outline" className="rounded-full">
                      {formatNumberEN(selectedAttachments.length)}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-6">
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
        "w-full rounded-[24px] border p-4 text-right transition-all",
        isActive
          ? "border-slate-900 bg-[linear-gradient(135deg,#111827_0%,#1e293b_100%)] text-white shadow-[0_20px_42px_-30px_rgba(15,23,42,0.68)]"
          : "border-slate-200 bg-slate-50/80 text-slate-900 hover:border-slate-300 hover:bg-white"
      )}
    >
      <div className="flex items-start justify-between gap-3">
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
              "mt-2 text-xs",
              isActive ? "text-white/60" : "text-slate-500"
            )}
          >
            رقم الطلب
          </div>
          <div
            className={cn(
              "mt-1 break-all text-xs font-medium",
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

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ListMetaItem
          icon={Phone}
          label="الجوال"
          value={summary.phone}
          active={isActive}
        />
        <ListMetaItem
          icon={ShieldCheck}
          label="التعليم"
          value={summary.education}
          active={isActive}
        />
        <ListMetaItem
          icon={CalendarDays}
          label="التاريخ"
          value={formatApplicationDate(application.createdAt)}
          active={isActive}
        />
        <ListMetaItem
          icon={Paperclip}
          label="عدد المرفقات"
          value={
            attachmentsCount > 0
              ? `${formatNumberEN(attachmentsCount)} ملف`
              : "بدون مرفقات"
          }
          active={isActive}
        />
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
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)]">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-500">{helper}</div>
    </div>
  );
}

function ListMetaItem({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3",
        active
          ? "border-white/10 bg-white/[0.06]"
          : "border-slate-200/80 bg-white/80"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn("h-4 w-4", active ? "text-white/70" : "text-slate-500")}
        />
        <span
          className={cn("text-xs", active ? "text-white/60" : "text-slate-500")}
        >
          {label}
        </span>
      </div>
      <div
        className={cn(
          "mt-2 truncate text-sm font-semibold",
          active ? "text-white" : "text-slate-900"
        )}
      >
        {value}
      </div>
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
    <div className="rounded-[22px] border border-slate-200/80 bg-white/[0.85] px-4 py-4">
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
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4">
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
    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
      <div className="text-xs font-medium text-slate-500">{answer.label}</div>
      <div className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-950">
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
    <div className="flex h-full flex-col justify-between rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-slate-950">
              <div className="rounded-2xl bg-white p-2 text-slate-700 shadow-sm">
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
          <Button asChild variant="outline" size="sm" className="rounded-full">
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
