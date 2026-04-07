import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import {
  BriefcaseBusiness,
  CalendarDays,
  Download,
  Eye,
  FileText,
  Paperclip,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/_core/firebase";
import { buildR2DownloadUrl } from "@/lib/documentUploadService";
import { formatDateTimeEN, formatFileSizeEN, formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  JOB_APPLICATIONS_COLLECTION,
  type RecruitmentApplicationAnswer,
  type RecruitmentApplicationDoc,
} from "@shared/recruitment";

type RecruitmentApplicationRecord = RecruitmentApplicationDoc & {
  id: string;
};

function toDateSafe(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as Timestamp)?.toDate === "function") {
    return (value as Timestamp).toDate();
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getAnswerDisplayValue(answer?: RecruitmentApplicationAnswer | null) {
  if (!answer) return "—";
  return String(answer.valueLabel || answer.value || "").trim() || "—";
}

function normalizeAnswerLabel(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function findAnswer(
  answers: RecruitmentApplicationAnswer[],
  preferredFieldIds: string[],
  labelKeywords: string[]
) {
  const byFieldId = answers.find((answer) => preferredFieldIds.includes(answer.fieldId));
  if (byFieldId) return byFieldId;

  return answers.find((answer) =>
    labelKeywords.some((keyword) => normalizeAnswerLabel(answer.label).includes(keyword))
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
      findAnswer(answers, ["phone_number", "phone", "mobile"], ["الجوال", "الهاتف", "phone"])
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

export default function RecruitmentApplicationsPage() {
  const [applications, setApplications] = useState<RecruitmentApplicationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applicationsQuery = query(
      collection(db, JOB_APPLICATIONS_COLLECTION),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      applicationsQuery,
      (snapshot) => {
        const nextApplications = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as RecruitmentApplicationDoc),
        }));

        setApplications(nextApplications);
        setSelectedId((current) => {
          if (current && nextApplications.some((item) => item.id === current)) {
            return current;
          }
          return nextApplications[0]?.id || "";
        });
        setLoading(false);
      },
      (error) => {
        console.error("recruitment applications snapshot error:", error);
        setApplications([]);
        setSelectedId("");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const selectedApplication = useMemo(
    () => applications.find((item) => item.id === selectedId) || null,
    [applications, selectedId]
  );

  const withAttachmentsCount = useMemo(
    () => applications.filter((item) => (item.attachments || []).length > 0).length,
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

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-6">
        <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] shadow-[0_28px_72px_-52px_rgba(15,23,42,0.28)]">
          <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] xl:items-end">
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
                    صفحة مستقلة لطلبات التوظيف القادمة من صفحة /careers، مع
                    استعراض البيانات الأساسية والمرفقات بعيدًا عن طلبات الاستثمار.
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
                    value={latestSubmissionAt ? formatDateTimeEN(latestSubmissionAt) : "—"}
                    helper="أحدث تاريخ تقديم"
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-[#1e3358] bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_28px_60px_-42px_rgba(2,6,23,0.85)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
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
                  القراءة من `job_applications`، والملفات المرفوعة محفوظة بمسار
                  مستقل تحت `careers/`.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
          <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
            <CardHeader className="border-b border-slate-100/80 pb-6">
              <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                قائمة الطلبات
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                يظهر هنا الاسم والجوال ونوع التعليم وتاريخ التقديم وحالة المرفقات.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-24 rounded-[22px] bg-slate-100"
                    />
                  ))}
                </div>
              ) : applications.length === 0 ? (
                <EmptyState
                  title="لا توجد طلبات توظيف حتى الآن"
                  description="ستظهر هنا الطلبات الجديدة فور إرسالها من صفحة التوظيف العامة."
                />
              ) : (
                <div className="space-y-3">
                  {applications.map((application) => {
                    const summary = getApplicationSummary(application);
                    const attachmentsCount = application.attachments?.length || 0;
                    const isActive = application.id === selectedId;

                    return (
                      <button
                        key={application.id}
                        type="button"
                        onClick={() => setSelectedId(application.id)}
                        className={cn(
                          "w-full rounded-[24px] border px-4 py-4 text-right transition-all",
                          isActive
                            ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.65)]"
                            : "border-slate-200 bg-slate-50/70 text-slate-900 hover:border-slate-300 hover:bg-white"
                        )}
                      >
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_160px] lg:items-start">
                          <div className="space-y-2">
                            <RowLabel
                              icon={User}
                              label="الاسم"
                              value={summary.fullName}
                              active={isActive}
                            />
                            <RowLabel
                              icon={Phone}
                              label="الجوال"
                              value={summary.phone}
                              active={isActive}
                            />
                          </div>

                          <div className="space-y-2">
                            <RowLabel
                              icon={ShieldCheck}
                              label="نوع التعليم"
                              value={summary.education}
                              active={isActive}
                            />
                            <RowLabel
                              icon={CalendarDays}
                              label="تاريخ التقديم"
                              value={
                                toDateSafe(application.createdAt)
                                  ? formatDateTimeEN(toDateSafe(application.createdAt))
                                  : "—"
                              }
                              active={isActive}
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full",
                                isActive
                                  ? "border-white/20 bg-white/10 text-white"
                                  : attachmentsCount > 0
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-white text-slate-500"
                              )}
                            >
                              {attachmentsCount > 0
                                ? `${formatNumberEN(attachmentsCount)} مرفقات`
                                : "بدون مرفقات"}
                            </Badge>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
            <CardHeader className="border-b border-slate-100/80 pb-6">
              <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                تفاصيل الطلب
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                افتح أي طلب من القائمة لعرض جميع البيانات والمرفقات المرسلة.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {!selectedApplication ? (
                <EmptyState
                  title="اختر طلبًا من القائمة"
                  description="عند اختيار أحد الطلبات ستظهر هنا جميع البيانات والمرفقات."
                />
              ) : (
                <>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="text-xs font-medium text-slate-500">
                      رقم الطلب
                    </div>
                    <div className="mt-2 break-all font-mono text-sm text-slate-900">
                      {selectedApplication.id}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-slate-950">
                      بيانات المتقدم
                    </div>
                    <div className="space-y-3">
                      {selectedAnswers.length ? (
                        selectedAnswers.map((answer) => (
                          <div
                            key={`${answer.fieldId}-${answer.order}`}
                            className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3"
                          >
                            <div className="text-xs font-medium text-slate-500">
                              {answer.label}
                            </div>
                            <div className="mt-2 text-sm font-semibold leading-7 text-slate-900">
                              {getAnswerDisplayValue(answer)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
                          لا توجد بيانات محفوظة داخل هذا الطلب.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950">
                        المرفقات
                      </div>
                      <Badge variant="outline" className="rounded-full">
                        {formatNumberEN(selectedAttachments.length)}
                      </Badge>
                    </div>

                    {selectedAttachments.length ? (
                      <div className="space-y-3">
                        {selectedAttachments.map((attachment) => {
                          const viewUrl =
                            String(attachment.fileUrl || "").trim() ||
                            buildR2DownloadUrl(attachment.filePath, false);
                          const downloadUrl =
                            buildR2DownloadUrl(attachment.filePath, true) || viewUrl;

                          return (
                            <div
                              key={`${attachment.fieldId}-${attachment.fileId}`}
                              className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-slate-900">
                                    <Paperclip className="h-4 w-4" />
                                    <span className="font-semibold">
                                      {attachment.label}
                                    </span>
                                  </div>
                                  <div className="text-sm text-slate-600">
                                    {attachment.fileName}
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                                    <span>{formatFileSizeEN(attachment.fileSize)}</span>
                                    <span>•</span>
                                    <span dir="ltr">{attachment.storageFolder}</span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {viewUrl ? (
                                    <Button asChild variant="outline" size="sm">
                                      <a href={viewUrl} target="_blank" rel="noreferrer">
                                        <Eye className="ml-2 h-4 w-4" />
                                        معاينة
                                      </a>
                                    </Button>
                                  ) : null}

                                  {downloadUrl ? (
                                    <Button asChild size="sm">
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
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
                        لا توجد مرفقات مرفوعة مع هذا الطلب.
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
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
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-500">{helper}</div>
    </div>
  );
}

function RowLabel({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: typeof User;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4", active ? "text-white/80" : "text-slate-500")} />
      <div className="min-w-0">
        <div className={cn("text-xs", active ? "text-white/60" : "text-slate-500")}>
          {label}
        </div>
        <div className={cn("truncate text-sm font-semibold", active ? "text-white" : "text-slate-900")}>
          {value}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
        <FileText className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-500">{description}</p>
    </div>
  );
}
