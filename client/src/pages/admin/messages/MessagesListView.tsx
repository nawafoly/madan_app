import { type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock3,
  Eye,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumberEN } from "@/lib/formatters";
import {
  RequestCardMetric,
  RequestCollectionSection,
  RequestSummaryTile,
} from "./Messages.parts";

type ListViewKey = "all" | "new" | "archived" | "open" | "completed" | "rejected";
type RequestKindViewKey = "all" | "investment" | "interest";

type MessagesListViewProps = {
  filtered: any[];
  newRequests: any[];
  archivedRequests: any[];
  loading: boolean;
  roleDocMissing: boolean;
  myRole: string;
  user: any;
  stats: any;
  clientSourceCounters: any;
  requestKindCounters: any;
  statusCounters: any;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  view: ListViewKey;
  setView: Dispatch<SetStateAction<ListViewKey>>;
  requestKindView: RequestKindViewKey;
  setRequestKindView: Dispatch<SetStateAction<RequestKindViewKey>>;
  navigateToRequestDetails: (requestId: string) => void;
  moneySAR: (value: any) => string;
};

export default function MessagesListView({
  filtered,
  newRequests,
  archivedRequests,
  loading,
  roleDocMissing,
  myRole,
  user,
  stats,
  clientSourceCounters,
  requestKindCounters,
  statusCounters,
  searchQuery,
  setSearchQuery,
  view,
  setView,
  requestKindView,
  setRequestKindView,
  navigateToRequestDetails,
  moneySAR,
}: MessagesListViewProps) {
  const getRequestViewLabel = (viewKey: string) => {
    if (viewKey === "all") return "الكل";
    if (viewKey === "new" || viewKey === "open") return "الجديدة";
    if (viewKey === "archived" || viewKey === "completed") {
      return "القديمة / المنتهية";
    }
    if (viewKey === "rejected") return "المرفوضة";
    return viewKey;
  };

  const renderRequestCard = (request: any) => {
    if (request.requestKind?.key === "interest") {
      const reviewMeta =
        request.interestReviewMeta;
      const trackingMeta =
        request.trackingMeta;
      const trackingSlaMeta =
        request.trackingSlaMeta;
      const narrative = request.summary || reviewMeta.helperText;
      const projectTitle =
        request.projectTitle && request.projectTitle !== "—"
          ? request.projectTitle
          : "لا يوجد مشروع مرتبط";

      return (
        <article
          key={request.id}
          className={cn(
            "group relative flex h-full flex-col overflow-hidden rounded-[22px] border p-4 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.32)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-32px_rgba(15,23,42,0.26)]",
            reviewMeta.cardClass
          )}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-1.5",
              reviewMeta.accent
            )}
          />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-slate-400">
                <span>إشارة اهتمام #{request.requestIdLabel}</span>
                <Badge
                  className={cn(
                    "border px-2.5 py-0.5 text-[10px] font-semibold shadow-none",
                    request.requestKind.badgeTone
                  )}
                >
                  {request.requestKind.label}
                </Badge>
                {request.client.sourceKey !== "live_user" ? (
                  <Badge
                    className={cn(
                      "border px-2 py-0.5 text-[10px] font-semibold shadow-none",
                      request.client.sourceTone
                    )}
                  >
                    {request.client.sourceLabel}
                  </Badge>
                ) : null}
              </div>

              <div>
                <h3 className="break-words text-[15px] font-semibold leading-6 text-slate-950">
                  {request.client.clientName}
                </h3>

                <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
                  <span className="inline-flex items-center rounded-full bg-amber-100/80 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                    طلب اهتمام
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="leading-6 text-slate-500">
                    {request.requestTimeLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge
                className={cn(
                  "border px-3 py-1 text-[11px] font-semibold shadow-none",
                  trackingMeta.tone
                )}
              >
                {trackingMeta.label}
              </Badge>
              {trackingSlaMeta ? (
                <Badge
                  className={cn(
                    "border px-2.5 py-0.5 text-[10px] font-semibold shadow-none",
                    trackingSlaMeta.className
                  )}
                >
                  {trackingSlaMeta.label}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-amber-200/80 bg-white/80 p-3">
            <div className="flex items-start gap-2 text-[13px] text-slate-700">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span className="min-w-0 break-words font-medium leading-6">
                {projectTitle}
              </span>
            </div>

            <div className="mt-3 rounded-[16px] border border-amber-200/70 bg-amber-50/70 px-3 py-3 text-sm leading-7 text-amber-950">
              {narrative}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <RequestCardMetric
              label="البريد أو الجوال"
              value={
                request.client.clientEmail ||
                request.client.clientPhone ||
                "—"
              }
              icon={<Mail className="h-3.5 w-3.5" />}
            />
            <RequestCardMetric
              label="وقت الإرسال"
              value={request.requestDateLabel || "—"}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
            />
            <RequestCardMetric
              label="الحالة"
              value={reviewMeta.label}
              icon={<Eye className="h-3.5 w-3.5" />}
              strong
            />
            <RequestCardMetric
              label="رقم الطلب"
              value={request.requestIdLabel}
              mono
            />
          </div>

          <div className="mt-3 rounded-[18px] border border-amber-200/70 bg-amber-50/45 px-3 py-3 text-sm leading-7 text-slate-700">
            {reviewMeta.helperText}
          </div>

          <div className="mt-auto pt-4">
            <Button
              className={cn(
                "h-10 w-full gap-2 rounded-2xl",
                request.requestKind.ctaClass
              )}
              onClick={() => navigateToRequestDetails(request.id)}
            >
              <Eye className="h-4 w-4" />
              {request.requestKind.ctaLabel}
            </Button>
          </div>
        </article>
      );
    }

    const hasLinkedInvestment = !!request.investmentId;
    const isInvestmentRequest = request.requestKind?.key === "investment";
    const progressBadgeLabel = isInvestmentRequest
      ? hasLinkedInvestment
        ? "تم إنشاء الاستثمار"
        : "بانتظار الإنشاء"
      : "متابعة تمهيدية";
    const progressBadgeTone = isInvestmentRequest
      ? hasLinkedInvestment
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-100 text-slate-600"
      : "border-amber-200 bg-amber-50 text-amber-800";
    const narrative = request.summary || request.requestKind.helperText;
    const lastActor = request.lastActor;
    const trackingMeta =
      request.trackingMeta;
    const trackingSlaMeta =
      request.trackingSlaMeta;

    return (
      <article
        key={request.id}
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-[22px] border p-4 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.38)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-32px_rgba(15,23,42,0.36)]",
          request.cardStatusClass
        )}
      >
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-1.5",
            request.statusMeta.accent
          )}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-slate-400">
              <span>طلب #{request.requestIdLabel}</span>
              <Badge
                className={cn(
                  "border px-2.5 py-0.5 text-[10px] font-semibold shadow-none",
                  request.requestKind.badgeTone
                )}
              >
                {request.requestKind.label}
              </Badge>
              {request.client.sourceKey !== "live_user" ? (
                <Badge
                  className={cn(
                    "border px-2 py-0.5 text-[10px] font-semibold shadow-none",
                    request.client.sourceTone
                  )}
                >
                  {request.client.sourceLabel}
                </Badge>
              ) : null}
            </div>

            <div>
              <h3 className="break-words text-[15px] font-semibold leading-6 text-slate-950">
                {request.client.clientName}
              </h3>

              <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {request.client.clientRoleLabel}
                </span>
                <span className="text-slate-300">•</span>
                <span className="leading-6 text-slate-500">
                  {request.requestTimeLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                trackingMeta.tone
              )}
            >
              {trackingMeta.label}
            </Badge>
            {trackingSlaMeta ? (
              <Badge
                className={cn(
                  "border px-2.5 py-0.5 text-[10px] font-semibold shadow-none",
                  trackingSlaMeta.className
                )}
              >
                {trackingSlaMeta.label}
              </Badge>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "mt-4 rounded-[18px] border p-3",
            request.requestKind.projectPanelClass
          )}
        >
          <div className="flex items-start gap-2 text-[13px] text-slate-700">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 break-words font-medium leading-6">
              {request.projectTitle}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                request.stageMeta.tone
              )}
            >
              {request.stageMeta.label}
            </Badge>
            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                request.statusMeta.tone
              )}
            >
              {request.statusMeta.label}
            </Badge>
            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                progressBadgeTone
              )}
            >
              {progressBadgeLabel}
            </Badge>
          </div>

          <div
            className={cn(
              "mt-3 rounded-[16px] px-3 py-3 text-sm leading-7",
              request.requestKind.helperClass
            )}
          >
            {narrative}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <RequestCardMetric
            label={request.requestKind.metricLabel}
            value={
              isInvestmentRequest
                ? moneySAR(request.amount)
                : request.requestKind.metricValue
            }
            icon={
              isInvestmentRequest ? (
                <Wallet className="h-3.5 w-3.5" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )
            }
            strong={isInvestmentRequest}
          />
          <RequestCardMetric
            label="تاريخ الطلب"
            value={request.requestDateLabel || "—"}
            icon={<CalendarDays className="h-3.5 w-3.5" />}
          />
          <RequestCardMetric
            label="آخر تحديث"
            value={request.updatedAtLabel || "—"}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          />
          <RequestCardMetric
            label="رقم الطلب"
            value={request.requestIdLabel}
            mono
          />
        </div>

        <div className="mt-3 rounded-[18px] border border-slate-200/70 bg-slate-50/60 px-3 py-3">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">
            آخر من عدّل
          </div>

          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lastActor.name}
          </div>

          <div className="mt-1 text-xs font-medium text-slate-500">
            {lastActor.roleLabel}
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            <span>{lastActor.relativeTimeLabel}</span>
          </div>

          <div className="mt-1 text-xs text-slate-500">
            التاريخ {lastActor.dateLabel}
          </div>
        </div>

        <div className="mt-auto pt-4">
          <Button
            className={cn(
              "h-10 w-full gap-2 rounded-2xl",
              request.requestKind.ctaClass
            )}
            onClick={() => navigateToRequestDetails(request.id)}
          >
            <Eye className="h-4 w-4" />
            {request.requestKind.ctaLabel}
          </Button>
        </div>
      </article>
    );
  };

  return (
    <>
            <section className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_70px_-42px_rgba(15,23,42,0.42)]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.66),transparent_55%)]" />

              <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-3">
                  <div className="inline-flex w-fit items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-teal-700">
                    سجل تشغيلي مباشر
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                      طلبات الاستثمار
                    </h1>
                  </div>
                  <p>
                    عرض شامل لجميع طلبات الاستثمار مع تتبع حالتها والإجراءات المرتبطة بها.              </p>
                </div>

                <div className="xl:min-w-[220px]">
                  <div className="rounded-[22px] border border-slate-200 bg-white/85 p-4 shadow-sm shadow-slate-200/70 backdrop-blur">
                    <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                      النتائج في العرض الحالي
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {formatNumberEN(filtered.length)}
                    </div>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      من أصل {formatNumberEN(stats.all)} سجل طلب في السجل.
                    </p>
                  </div>
                </div>
              </div>

              {roleDocMissing && myRole !== "owner" ? (
                <div className="relative mt-5 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-7 text-amber-900">
                  ملاحظة: لم يتم العثور على ملف الصلاحيات للحساب داخل{" "}
                  <code>users/{user?.uid}</code> وقد تظهر بعض الإجراءات بصلاحية عرض
                  فقط.
                </div>
              ) : null}
            </section>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <RequestSummaryTile
                title="إجمالي الطلبات"
                value={stats.all}
                helper={`${formatNumberEN(filtered.length)} سجل ضمن نتائج العرض الحالية`}
                icon={<FileText className="h-4 w-4" />}
                tone="amber"
              />
              <RequestSummaryTile
                title="الطلبات المفتوحة"
                value={stats.open}
                helper="تشمل الطلبات قيد المعالجة أو الانتظار"
                icon={<Clock3 className="h-4 w-4" />}
                tone="blue"
              />
              <RequestSummaryTile
                title="مربوطة بملف حي"
                value={clientSourceCounters.live}
                helper="الاسم والبريد من مستند المستخدم الحالي"
                icon={<RefreshCw className="h-4 w-4" />}
                tone="emerald"
              />
              <RequestSummaryTile
                title="تحتاج مراجعة ربط"
                value={
                  clientSourceCounters.requestSnapshot +
                  clientSourceCounters.unknown
                }
                helper="تعتمد على بيانات الطلب أو بيانات ناقصة"
                icon={<AlertTriangle className="h-4 w-4" />}
                tone="rose"
              />
            </div>

            <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.42)]">
              <div className="border-b border-slate-200/70 px-4 py-5 sm:px-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-4 xl:max-w-3xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                        عرض مؤسسي سريع القراءة
                      </h2>
                    </div>

                    <div className="relative w-full xl:max-w-xl">
                      <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="ابحث باسم العميل أو البريد أو المشروع أو رقم الطلب"
                        className="h-11 rounded-2xl border-slate-200 bg-slate-50/80 pr-11 text-sm shadow-none placeholder:text-slate-400"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { key: "all", label: "الكل", count: stats.all },
                        { key: "open", label: "مفتوح", count: stats.open },
                        { key: "completed", label: "مقفل", count: stats.completed },
                        { key: "rejected", label: "مرفوض", count: stats.rejected },
                      ].map(option => (
                        <Button
                          key={option.key}
                          variant="outline"
                          className={cn(
                            "h-10 rounded-2xl border px-4 text-sm shadow-none",
                            view === option.key
                              ? "border-slate-950 bg-slate-950 text-white hover:bg-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          )}
                          onClick={() => setView(option.key as typeof view)}
                        >
                          {getRequestViewLabel(String(option.key))}
                          <span
                            className={cn(
                              "mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              view === option.key
                                ? "bg-white/15 text-white"
                                : "bg-black/5 text-slate-700"
                            )}
                          >
                            {formatNumberEN(option.count)}
                          </span>
                        </Button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold tracking-[0.14em] text-slate-400">
                        نوع الطلب
                      </span>
                      {[
                        { key: "all", label: "الكل", count: stats.all },
                        {
                          key: "investment",
                          label: "طلبات استثمار",
                          count: requestKindCounters.investment,
                        },
                        {
                          key: "interest",
                          label: "طلبات اهتمام",
                          count: requestKindCounters.interest,
                        },
                      ].map(option => (
                        <Button
                          key={option.key}
                          variant="outline"
                          className={cn(
                            "h-9 rounded-2xl border px-4 text-xs shadow-none",
                            requestKindView === option.key
                              ? option.key === "interest"
                                ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                : "border-slate-950 bg-slate-950 text-white hover:bg-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          )}
                          onClick={() =>
                            setRequestKindView(
                              option.key as typeof requestKindView
                            )
                          }
                        >
                          {option.label}
                          <span
                            className={cn(
                              "mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              requestKindView === option.key
                                ? option.key === "interest"
                                  ? "bg-amber-900/10 text-amber-900"
                                  : "bg-white/15 text-white"
                                : "bg-black/5 text-slate-700"
                            )}
                          >
                            {formatNumberEN(option.count)}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                        نتائج العرض
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {formatNumberEN(filtered.length)}
                      </div>
                      <p className="mt-1 text-xs leading-6 text-slate-500">
                        من أصل {formatNumberEN(stats.all)} سجل طلب.
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-emerald-200 bg-emerald-50/70 p-4">
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-emerald-700">
                        ربط مباشر
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-emerald-950">
                        {formatNumberEN(clientSourceCounters.live)}
                      </div>
                      <p className="mt-1 text-xs leading-6 text-emerald-800/80">
                        طلبات مرتبطة حاليًا بملف المستخدم الحالي.
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-4">
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-amber-700">
                        تنبيه بيانات
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-amber-950">
                        {formatNumberEN(
                          clientSourceCounters.requestSnapshot +
                          clientSourceCounters.unknown
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-6 text-amber-900/75">
                        حالات تحتاج مراجعة الربط أو بياناتها ناقصة.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    {
                      key: "pending",
                      label: "بانتظار المراجعة",
                      count: statusCounters.pending,
                      tone: "border-amber-200 bg-amber-50 text-amber-800",
                    },
                    {
                      key: "reviewing",
                      label: "قيد المراجعة",
                      count: statusCounters.reviewing,
                      tone: "border-sky-200 bg-sky-50 text-sky-800",
                    },
                    {
                      key: "approved",
                      label: "موافقة أولية",
                      count: statusCounters.approved,
                      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
                    },
                    {
                      key: "completed",
                      label: "مكتمل أو مغلق",
                      count: statusCounters.completed,
                      tone: "border-slate-200 bg-slate-100 text-slate-700",
                    },
                  ].map(item => (
                    <div
                      key={item.key}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                        item.tone
                      )}
                    >
                      <span>{item.label}</span>
                      <span className="rounded-full bg-white/85 px-2 py-0.5 text-[11px] text-slate-700">
                        {formatNumberEN(item.count)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4 py-5 sm:px-6 sm:py-6" dir="rtl">
                <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-slate-950">
                      <MessageSquare className="h-5 w-5" />
                      <h3 className="text-lg font-semibold tracking-tight">
                        طلبات الاستثمار
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-500">
                      بطاقات مختصرة تعرض العميل، البريد، المشروع، الحالة، نوع
                      الطلب، تاريخ الطلب، آخر تحديث، والإجراء الأساسي دون ازدحام
                      بصري.
                    </p>
                  </div>

                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                    {formatNumberEN(filtered.length)} سجل
                  </div>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    جاري تحميل الطلبات...
                  </div>
                ) : filtered.length ? (
                  <div className="space-y-6">
                    <RequestCollectionSection
                      title="الطلبات الجديدة"
                      description="طلبات تحتاج متابعة مباشرة الآن. طلبات الاستثمار تبقى هنا حتى تُرفض أو تكتمل، وطلبات الاهتمام تبقى هنا حتى يتم الاطلاع عليها."
                      count={newRequests.length}
                      tone="new"
                    >
                      {newRequests.length ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          {newRequests.map(request => renderRequestCard(request))}
                        </div>
                      ) : null}
                    </RequestCollectionSection>

                    <RequestCollectionSection
                      title="الطلبات القديمة / المنتهية"
                      description="يشمل الطلبات التي خرجت من دائرة المتابعة الفورية: الاستثمارات المرفوضة أو المكتملة، وطلبات الاهتمام التي تم الاطلاع عليها."
                      count={archivedRequests.length}
                      tone="archived"
                    >
                      {archivedRequests.length ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          {archivedRequests.map(request => renderRequestCard(request))}
                        </div>
                      ) : null}
                    </RequestCollectionSection>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center">
                    <div className="text-base font-semibold text-slate-900">
                      لا توجد طلبات مطابقة للبحث أو الفلتر الحالي
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-500">
                      جرّب تغيير الفلتر أو البحث باسم العميل أو البريد أو المشروع.
                    </p>
                  </div>
                )}
              </div>
            </section>


            <Card className="hidden rsg-card border-slate-200/80 bg-white/95 shadow-[0_22px_70px_-46px_rgba(15,23,42,0.42)]">
              <CardHeader className="gap-4 border-b border-slate-200/70 pb-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl font-semibold text-slate-950">
                    <MessageSquare className="h-5 w-5" />
                    طلبات الاستثمار
                  </CardTitle>

                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                    {formatNumberEN(filtered.length)} سجل
                  </div>
                </div>

                <p className="text-sm leading-7 text-slate-500">
                  الاسم والبريد في هذه البطاقات يتم تحديثهما من ملف المستخدم الحالي،
                  مع استخدام بيانات الطلب كبديل فقط عند غياب الربط، ومع تمييز بصري
                  واضح بين الاستثمار الفعلي والاهتمام التمهيدي.
                </p>
              </CardHeader>

              <CardContent className="pt-6" dir="rtl">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    جاري تحميل الطلبات...
                  </div>
                ) : filtered.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {filtered.map(request => renderRequestCard(request))}
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center">
                    <div className="text-base font-semibold text-slate-900">
                      لا توجد طلبات مطابقة للبحث أو الفلتر الحالي
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-500">
                      جرّب تغيير الفلتر أو البحث باسم العميل أو البريد أو المشروع.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
    </>
  );
}