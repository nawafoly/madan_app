import { useEffect, useRef, type ReactNode } from "react";
import { formatNumberEN } from "@/lib/formatters";
import { getClientContractStatusLabel } from "@shared/investmentLifecycle";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, CheckCircle2, Clock3, Download, Eye, FileText, Loader2, ShieldCheck, Upload, Wallet } from "lucide-react";

const DETAIL_SECTION_CARD_CLASS =
  "overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.94)_100%)] shadow-[0_24px_60px_-42px_rgba(15,23,42,0.28)]";
const DETAIL_SECTION_HEADER_CLASS = "border-b border-slate-200/80 px-6 pb-4 pt-5";
const DETAIL_SECTION_TITLE_CLASS =
  "text-[1.02rem] font-semibold tracking-tight text-slate-950";
const DETAIL_SECTION_CONTENT_CLASS = "space-y-5 px-6 pb-6 pt-5 text-slate-700";
const DETAIL_INPUT_ROW_CLASS =
  "grid grid-cols-1 items-start gap-3 rounded-[20px] border border-slate-200/80 bg-slate-50/85 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] md:grid-cols-[120px_1fr] md:gap-4";
const DETAIL_INPUT_LABEL_CLASS =
  "pt-1 text-right text-[11px] font-semibold tracking-[0.14em] text-slate-400";
const DETAIL_INPUT_VALUE_CLASS =
  "break-words text-right text-[15px] font-semibold leading-7 text-slate-950";
const DETAIL_INLINE_PANEL_CLASS =
  "rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]";
const DETAIL_INLINE_LABEL_CLASS =
  "mb-3 text-[11px] font-semibold tracking-[0.14em] text-slate-400";
const DETAIL_TEXTAREA_CLASS =
  "min-h-[132px] rounded-[20px] border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-950 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.36)] placeholder:text-slate-400";
const DETAIL_ALERT_CLASS =
  "rounded-[20px] border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,rgba(255,255,255,0.98)_100%)] px-4 py-3.5 text-sm leading-7 text-amber-950";
const DETAIL_BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const DETAIL_LIGHT_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 bg-slate-950 text-white shadow-[0_18px_38px_-26px_rgba(15,23,42,0.48)] hover:bg-[#10203a]`;
const DETAIL_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.3)]`;

function getContractStatusLabel(status: any): string {
  return getClientContractStatusLabel(status);
}

function getContractStatusClass(status: any): string {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  const map: Record<string, string> = {
    draft: "border-slate-200 bg-slate-100 text-slate-700",
    sent: "border-sky-200 bg-sky-50 text-sky-800",
    pending_signature: "border-amber-200 bg-amber-50 text-amber-800",
    signed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    issued: "border-sky-200 bg-sky-50 text-sky-800",
    signed_uploaded: "border-emerald-200 bg-emerald-50 text-emerald-800",
    under_review: "border-violet-200 bg-violet-50 text-violet-800",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return map[s] || "border-slate-200 bg-slate-100 text-slate-700";
}

export function RequestSummaryTile({
  title,
  value,
  helper,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon?: ReactNode;
  tone: "amber" | "blue" | "emerald" | "rose";
}) {
  const toneMap = {
    amber: "border-amber-200 bg-amber-50/80 text-amber-800",
    blue: "border-sky-200 bg-sky-50/80 text-sky-800",
    emerald: "border-emerald-200 bg-emerald-50/80 text-emerald-800",
    rose: "border-rose-200 bg-rose-50/80 text-rose-800",
  } as const;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/95 p-4 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.32)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
            {title}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {formatNumberEN(value)}
          </div>
        </div>

        {icon ? (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl border",
              toneMap[tone]
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

export function RequestCollectionSection({
  title,
  description,
  count,
  tone,
  children,
}: {
  title: string;
  description: string;
  count: number;
  tone: "new" | "archived";
  children?: ReactNode;
}) {
  const toneMap = {
    new: {
      shell:
        "border-sky-200/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.88)_0%,rgba(255,255,255,0.98)_22%,#ffffff_100%)]",
      badge: "border-sky-200 bg-sky-50 text-sky-800",
      empty: "border-sky-200/70 bg-sky-50/60 text-sky-900",
    },
    archived: {
      shell:
        "border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(255,255,255,0.98)_24%,#ffffff_100%)]",
      badge: "border-slate-200 bg-slate-100 text-slate-700",
      empty: "border-slate-200/80 bg-slate-50/70 text-slate-800",
    },
  } as const;

  return (
    <section
      className={cn(
        "rounded-[26px] border px-4 py-5 sm:px-5",
        toneMap[tone].shell
      )}
    >
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-200/70 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-lg font-semibold tracking-tight text-slate-950">
            {title}
          </h4>
          <p className="mt-1 text-sm leading-7 text-slate-500">
            {description}
          </p>
        </div>

        <div
          className={cn(
            "inline-flex w-fit items-center rounded-full border px-3 py-1 text-sm font-semibold",
            toneMap[tone].badge
          )}
        >
          {formatNumberEN(count)} سجل
        </div>
      </div>

      {count ? (
        children
      ) : (
        <div
          className={cn(
            "rounded-[20px] border border-dashed px-4 py-8 text-center text-sm leading-7",
            toneMap[tone].empty
          )}
        >
          لا توجد عناصر في هذا القسم ضمن نتائج البحث الحالية.
        </div>
      )}
    </section>
  );
}

export function DetailSection({
  title,
  description,
  badge,
  children,
  className,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rsg-card", DETAIL_SECTION_CARD_CLASS, className)}>
      <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>{title}</CardTitle>
            {description ? (
              <p className="text-sm leading-7 text-slate-500">{description}</p>
            ) : null}
          </div>

          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      </CardHeader>

      <CardContent className={DETAIL_SECTION_CONTENT_CLASS}>{children}</CardContent>
    </Card>
  );
}

export function DetailSummaryMetric({
  label,
  value,
  helper,
  icon,
  strong = false,
  mono = false,
  className,
}: {
  label: string;
  value: any;
  helper?: string;
  icon?: ReactNode;
  strong?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.95)_100%)] px-4 py-3.5 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.34)]",
        className
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-400">
        {icon ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            {icon}
          </span>
        ) : null}
        <span>{label}</span>
      </div>

      <div
        className={cn(
          "mt-3 break-words text-[14px] leading-6 text-slate-700",
          strong ? "text-[15px] font-semibold text-slate-950" : "font-medium",
          mono ? "font-mono text-[12px] sm:text-[13px]" : ""
        )}
      >
        {value ?? "—"}
      </div>

      {helper ? (
        <p className="mt-2 text-xs leading-6 text-slate-500">{helper}</p>
      ) : null}
    </div>
  );
}

export function DetailDocumentsMetricCard({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.22)]">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            {icon}
          </span>
        ) : null}
        <span>{label}</span>
      </div>

      <div className="mt-3 min-h-[2.75rem]">{children}</div>
    </div>
  );
}

export function DetailDocumentsTab({
  isArchiveMode,
  children,
}: {
  isArchiveMode: boolean;
  children: ReactNode;
}) {
  return (
    <DetailSection
      title="المستندات المرتبطة"
      description={
        isArchiveMode
          ? "تُعرض المستندات هنا للرجوع والقراءة فقط ضمن وضع الأرشيف."
          : "ملفات الاستثمار والعقود المرتبطة بهذا الطلب."
      }
    >
      {children}
    </DetailSection>
  );
}

export function DetailBinaryBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <Badge
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium shadow-none",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-gray-200 bg-gray-100 text-gray-500"
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

export function DetailDocumentFileCard({
  title,
  available,
  fileName,
  viewUrl,
  downloadUrl,
  emptyTitle,
  emptyDescription,
  alertText,
}: {
  title: string;
  available: boolean;
  fileName: string;
  viewUrl?: string | null;
  downloadUrl?: string | null;
  emptyTitle: string;
  emptyDescription: string;
  alertText?: string;
}) {
  const isSignedDocument = title.includes("الموق");
  const description = isSignedDocument
    ? "نسخة العقد بعد التوقيع لمراجعتها واستكمال التفعيل"
    : "نسخة معتمدة للمراجعة قبل التوقيع";
  const footerLabel = isSignedDocument
    ? available
      ? "مرفوع من المستثمر"
      : "بانتظار رفع المستثمر"
    : "داخل المنصة";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.995)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_28px_60px_-40px_rgba(15,23,42,0.28)]">
      <div className="absolute left-6 top-6">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold leading-none",
            available
              ? "border-slate-200 bg-slate-50 text-slate-500"
              : "border-gray-200 bg-gray-100 text-gray-500"
          )}
        >
          {available ? "PDF" : "لا يوجد"}
        </span>
      </div>

      <div className="absolute right-6 top-5 flex h-11 w-11 -translate-y-0.5 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_20px_34px_-20px_rgba(15,23,42,0.55)]">
        <FileText className="h-5 w-5" />
      </div>

      <div className="flex min-h-[300px] flex-col pt-12">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xl font-semibold tracking-tight text-slate-950">{title}</div>
            <div className="text-sm leading-6 text-slate-500">{description}</div>
          </div>

          {available ? (
            <div className="break-words text-[15px] font-medium leading-7 text-slate-700">
              {fileName}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200/80">
                <FileText className="h-[18px] w-[18px]" />
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{emptyTitle}</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">{emptyDescription}</div>
            </div>
          )}

          {alertText ? <div className={cn(DETAIL_ALERT_CLASS, "!rounded-2xl")}>{alertText}</div> : null}
        </div>

        <div className="mt-auto pt-6">
          <div className="mb-4 h-px bg-slate-200/80" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">{footerLabel}</div>

            {available ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {viewUrl ? (
                  <a href={viewUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-full rounded-full border border-primary bg-white px-4 text-primary shadow-sm hover:bg-primary/10 hover:text-primary sm:w-auto"
                    >
                      <Eye className="h-4 w-4 text-current" />
                      عرض
                    </Button>
                  </a>
                ) : null}

                {downloadUrl ? (
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto"
                  >
                    <Button
                      size="sm"
                      className="h-10 w-full rounded-full bg-primary px-4 text-primary-foreground shadow-[0_14px_28px_-16px_rgba(15,23,42,0.4)] hover:bg-primary/90 sm:w-auto"
                    >
                      <Download className="h-4 w-4 text-current" />
                      تنزيل
                    </Button>
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DetailContractUploadPanel({
  file,
  onFileChange,
  disabled = false,
  busy = false,
  buttonLabel,
  onSubmit,
  submitDisabled = false,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  busy?: boolean;
  buttonLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileName = String(file?.name || "").trim();
  const hasFile = Boolean(fileName);

  useEffect(() => {
    if (!file && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [file]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.22)]">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        disabled={disabled}
        onChange={e => onFileChange(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        className={cn(
          "group w-full rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          hasFile
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-slate-300/80 bg-muted/30",
          disabled
            ? "cursor-not-allowed opacity-70"
            : "hover:border-primary hover:bg-muted/10"
        )}
        onClick={() => {
          if (disabled) return;
          if (inputRef.current) {
            inputRef.current.value = "";
            inputRef.current.click();
          }
        }}
        disabled={disabled}
      >
        <div
          className={cn(
            "mx-auto flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm",
            hasFile
              ? "border-emerald-200 text-emerald-700"
              : "border-slate-200 text-slate-600 group-hover:border-primary group-hover:text-primary"
          )}
        >
          {hasFile ? (
            <FileText className="h-7 w-7" />
          ) : (
            <Upload className="h-7 w-7" />
          )}
        </div>

        <div className="mt-4 break-words text-base font-semibold text-slate-950">
          {hasFile ? fileName : "اسحب الملف هنا أو اضغط للاختيار"}
        </div>

        <div className="mt-1 text-sm text-slate-500">
          {hasFile ? "ملف PDF جاهز للرفع. اضغط لتغييره." : "PDF فقط"}
        </div>
      </button>

      <Button
        className={`w-full sm:w-auto ${DETAIL_SOLID_BUTTON_CLASS} bg-blue-700 hover:bg-blue-800`}
        onClick={onSubmit}
        disabled={submitDisabled}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {buttonLabel}
      </Button>
    </div>
  );
}

export function DetailContractStatusBadges({
  status,
  followupLabel,
}: {
  status: any;
  followupLabel?: string;
}) {
  const normalizedStatus = String(status || "")
    .trim()
    .toLowerCase();

  const statusIcon =
    normalizedStatus === "under_review" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : normalizedStatus === "approved" ||
      normalizedStatus === "signed" ||
      normalizedStatus === "signed_uploaded" ? (
      <ShieldCheck className="h-3.5 w-3.5" />
    ) : (
      <Clock3 className="h-3.5 w-3.5" />
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-none",
          getContractStatusClass(status)
        )}
      >
        {statusIcon}
        <span>{getContractStatusLabel(status)}</span>
      </Badge>

      {followupLabel ? (
        <Badge className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 shadow-none">
          {followupLabel}
        </Badge>
      ) : null}
    </div>
  );
}

export function DetailContextTab({
  selectedRequestSummary,
  isSelectedInterestRequest,
  selectedProjectTitle,
  selectedInterestReviewMeta,
  selectedAmountLabel,
  selectedInvestmentId,
  selectedRequestKind,
}: {
  selectedRequestSummary: string;
  isSelectedInterestRequest: boolean;
  selectedProjectTitle: any;
  selectedInterestReviewMeta: {
    label?: string;
    helperText?: string;
  } | null;
  selectedAmountLabel: string;
  selectedInvestmentId: any;
  selectedRequestKind: {
    helperText?: string;
  } | null;
}) {
  return (
    <DetailSection
      title="السياق المرتبط بالطلب"
      description="المحتوى الوصفي والتفسيري المرتبط بهذا السجل دون منحه وزنًا تشغيليًا أعلى من اللازم."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] p-5 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.18)]">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
            رسالة العميل / الوصف
          </div>
          <p className="mt-3 text-sm leading-8 text-slate-700">
            {selectedRequestSummary || "لا توجد رسالة مفصلة مرفقة مع هذا الطلب."}
          </p>
        </div>

        <div
          className={cn(
            "rounded-[24px] border px-5 py-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]",
            isSelectedInterestRequest
              ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)]"
              : "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(255,255,255,0.98)_100%)]"
          )}
        >
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
            {isSelectedInterestRequest ? "قراءة الاهتمام" : "قراءة الاستثمار"}
          </div>
          <div className="mt-3 space-y-3">
            <DetailSummaryMetric
              label="المشروع"
              value={selectedProjectTitle}
              icon={<Building2 className="h-3.5 w-3.5" />}
              strong
              className="border-transparent bg-white/85 shadow-none"
            />
            {isSelectedInterestRequest ? (
              <DetailSummaryMetric
                label="وضع المتابعة"
                value={selectedInterestReviewMeta?.label || "جديد"}
                helper={selectedInterestReviewMeta?.helperText}
                icon={<Eye className="h-3.5 w-3.5" />}
                className="border-transparent bg-white/85 shadow-none"
              />
            ) : (
              <>
                <DetailSummaryMetric
                  label="المبلغ"
                  value={selectedAmountLabel}
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  strong
                  className="border-transparent bg-white/85 shadow-none"
                />
                <DetailSummaryMetric
                  label="سجل الاستثمار"
                  value={
                    selectedInvestmentId
                      ? "تم إنشاء سجل الاستثمار"
                      : "بانتظار إنشاء السجل"
                  }
                  helper={
                    selectedInvestmentId
                      ? `رقم السجل ${selectedInvestmentId}`
                      : undefined
                  }
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  className="border-transparent bg-white/85 shadow-none"
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "rounded-[24px] border px-5 py-4 text-sm leading-8 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.2)]",
          isSelectedInterestRequest
            ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-amber-950"
            : "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-emerald-950"
        )}
      >
        {isSelectedInterestRequest
          ? selectedInterestReviewMeta?.helperText || selectedRequestKind?.helperText
          : selectedInvestmentId
            ? "تم ربط هذا الطلب بسجل استثمار فعلي، لذلك يظهر هنا كسجل تشغيلي مرتبط بالمستندات والحالة الحالية."
            : "هذا الطلب ما زال في المرحلة السابقة لإنشاء الاستثمار، لذلك يبقى التركيز على المشروع والمبلغ والقرار المطلوب من الفريق."}
      </div>
    </DetailSection>
  );
}

export function DetailInternalNotesTab({
  canEditInternalNotes,
  internalNotes,
  setInternalNotes,
  handleSaveNotesOnly,
  hasStoredInternalNotes,
}: {
  canEditInternalNotes: boolean;
  internalNotes: string;
  setInternalNotes: (value: string) => void;
  handleSaveNotesOnly: () => void;
  hasStoredInternalNotes: boolean;
}) {
  return (
    <DetailSection
      title="الملاحظات الداخلية"
      description={
        canEditInternalNotes
          ? "ملاحظات تنظيمية داخلية يمكن تحديثها ضمن الحالة الحالية."
          : "ملاحظات داخلية محفوظة للرجوع فقط."
      }
    >
      {canEditInternalNotes ? (
        <div className="space-y-4">
          <div className={DETAIL_INLINE_PANEL_CLASS}>
            <Label className={DETAIL_INLINE_LABEL_CLASS}>ملاحظات داخلية</Label>
            <Textarea
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              placeholder="ملاحظات للإدارة فقط..."
              className={DETAIL_TEXTAREA_CLASS}
            />
            <p className="mt-3 text-xs leading-6 text-slate-500">
              هذا الحقل مخصص للملاحظات الداخلية والتنظيمية فقط.
            </p>
          </div>
          <Button
            className={cn(DETAIL_LIGHT_SOLID_BUTTON_CLASS, "w-full sm:w-auto")}
            onClick={handleSaveNotesOnly}
          >
            <CheckCircle2 className="h-4 w-4" />
            حفظ الملاحظات
          </Button>
        </div>
      ) : (
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-sm leading-8 text-slate-700">
          {hasStoredInternalNotes
            ? internalNotes
            : "لا توجد ملاحظات داخلية محفوظة لهذا السجل."}
        </div>
      )}
    </DetailSection>
  );
}

export function DetailTimelineItem({
  title,
  note,
  actorName,
  actorRole,
  timeLabel,
  dateLabel,
}: {
  title: string;
  note?: string | null;
  actorName: string;
  actorRole: string;
  timeLabel: string;
  dateLabel: string;
}) {
  return (
    <div className="relative rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] px-4 py-4 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.24)]">
      <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-slate-900" />

      <div className="pr-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold leading-6 text-slate-950">
              {title}
            </h4>
            <div className="mt-1 text-xs leading-6 text-slate-500">
              {actorName} • {actorRole}
            </div>
          </div>

          <div className="text-xs leading-6 text-slate-500 sm:text-left">
            <div>{timeLabel}</div>
            <div>{dateLabel}</div>
          </div>
        </div>

        {note ? (
          <p className="mt-3 text-sm leading-7 text-slate-600">{note}</p>
        ) : null}
      </div>
    </div>
  );
}

export function DetailTimelineTab({
  selectedTimelineEvents,
}: {
  selectedTimelineEvents: Array<{
    id: string;
    title: string;
    note: string | null;
    actor: {
      name: string;
      roleLabel: string;
    };
    timeLabel: string;
    atLabel: string;
  }>;
}) {
  return (
    <DetailSection
      title="السجل الزمني"
      description="التحديثات والأنشطة السابقة المرتبطة بهذا السجل."
    >
      {selectedTimelineEvents.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {selectedTimelineEvents.map(item => (
            <DetailTimelineItem
              key={item.id}
              title={item.title}
              note={item.note}
              actorName={item.actor.name}
              actorRole={item.actor.roleLabel}
              timeLabel={item.timeLabel}
              dateLabel={item.atLabel}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm leading-7 text-slate-500">
          لا توجد أنشطة إضافية مسجلة على هذا الطلب حتى الآن.
        </div>
      )}
    </DetailSection>
  );
}

export function RequestCardMetric({
  label,
  value,
  icon,
  strong = false,
  mono = false,
}: {
  label: string;
  value: any;
  icon?: ReactNode;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[16px] border border-slate-200/80 bg-slate-50/90 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-slate-400">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        <span>{label}</span>
      </div>

      <div
        className={cn(
          "mt-1.5 break-words text-[13px] leading-5 text-slate-800",
          strong ? "font-semibold text-slate-950" : "font-medium",
          mono ? "font-mono text-[11px] sm:text-xs" : ""
        )}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className={DETAIL_INPUT_ROW_CLASS}>
      <div className={DETAIL_INPUT_LABEL_CLASS}>{label}</div>

      <div className={DETAIL_INPUT_VALUE_CLASS}>{value ?? "—"}</div>
    </div>
  );
}
