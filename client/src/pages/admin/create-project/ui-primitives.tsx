import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { UploadCloud, type LucideIcon } from "lucide-react";
import type {
  FieldProps,
  MetricCardProps,
  SectionCompletionStatus,
  SectionCardProps,
  UploadDropzoneProps,
} from "./shared";

type StatusAppearance = {
  strip: string;
  badge: string;
  dot: string;
  iconWrap: string;
  icon: string;
};

export function getStatusAppearance(status?: SectionCompletionStatus): StatusAppearance {
  if (status === "complete") {
    return {
      strip: "bg-emerald-500/30",
      badge: "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700",
      dot: "bg-emerald-500/70",
      iconWrap: "border-emerald-500/12 bg-emerald-500/[0.07]",
      icon: "text-emerald-700",
    };
  }

  if (status === "incomplete") {
    return {
      strip: "bg-red-500/28",
      badge: "border-red-500/18 bg-red-500/[0.06] text-red-700",
      dot: "bg-red-500/70",
      iconWrap: "border-red-500/12 bg-red-500/[0.05]",
      icon: "text-red-700",
    };
  }

  return {
    strip: "bg-slate-200/90",
    badge: "border-slate-200 bg-white text-slate-600",
    dot: "bg-slate-300",
    iconWrap: "border-white/70 bg-white/90",
    icon: "text-slate-800",
  };
}

export function getStatusLabel(status?: SectionCompletionStatus) {
  if (status === "complete") return "مكتمل";
  if (status === "incomplete") return "غير مكتمل";
  return "بدون حالة";
}

export function SectionCard({
  id,
  index,
  title,
  description,
  icon: Icon,
  children,
  headerAside,
  status,
  toneClassName,
}: SectionCardProps) {
  const statusAppearance = getStatusAppearance(status);

  return (
    <Card
      id={id}
      className="relative scroll-mt-40 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur"
    >
      {status ? <div className={cn("absolute inset-y-0 right-0 w-[3px]", statusAppearance.strip)} /> : null}
      <CardHeader
        className={cn(
          "gap-4 border-b border-slate-200/70 pb-6",
          toneClassName ??
            "bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))]"
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
                statusAppearance.iconWrap
              )}
            >
              <Icon className={cn("h-5 w-5", statusAppearance.icon)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>{`Section ${String(index).padStart(2, "0")}`}</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>Project Builder</span>
              </div>
              <CardTitle className="text-xl font-semibold tracking-tight text-slate-950">
                {title}
              </CardTitle>
              <CardDescription className="max-w-3xl text-[0.95rem] text-slate-600">
                {description}
              </CardDescription>
            </div>
          </div>
          {status || headerAside ? (
            <div className="flex flex-wrap items-center gap-2">
              {status ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold",
                    statusAppearance.badge
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusAppearance.dot)} />
                  <span>{getStatusLabel(status)}</span>
                </span>
              ) : null}
              {headerAside}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-6 md:p-7">{children}</CardContent>
    </Card>
  );
}

export function Field({ label, hint, required = false, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-semibold text-slate-800">{label}</Label>
        {required ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            مطلوب
          </span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-xs leading-6 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "default",
  status,
  className,
}: MetricCardProps) {
  const dark = tone === "dark";
  const statusAppearance = getStatusAppearance(status);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 py-3 shadow-sm",
        dark ? "border-white/12 bg-white/8 text-white" : "border-slate-200/80 bg-slate-50/80",
        className
      )}
    >
      {status && !dark ? (
        <div className={cn("absolute inset-y-0 right-0 w-[3px]", statusAppearance.strip)} />
      ) : null}
      <div
        className={cn(
          "flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]",
          dark ? "text-slate-200/80" : "text-slate-500"
        )}
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-xl border",
            dark ? "border-white/12 bg-white/10" : status ? statusAppearance.iconWrap : "border-white bg-white"
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              dark ? "text-amber-300" : status ? statusAppearance.icon : "text-slate-500"
            )}
          />
        </span>
        <span>{label}</span>
      </div>
      <div className={cn("mt-2 text-sm font-semibold", dark ? "text-white" : "text-slate-950")}>
        {value}
      </div>
    </div>
  );
}

type SectionLayoutProps = {
  children: ReactNode;
  aside: ReactNode;
  className?: string;
  contentClassName?: string;
  asideClassName?: string;
};

export type SectionDiagnosticMetric = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  status?: SectionCompletionStatus;
};

export type SectionDiagnosticCardConfig = {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  summary: ReactNode;
  metrics: ReadonlyArray<SectionDiagnosticMetric>;
  className?: string;
  summaryLabel?: string;
};

export type SectionDiagnosticCardProps = SectionDiagnosticCardConfig & {
  status?: SectionCompletionStatus;
};

export function SectionBodyLayout({
  children,
  aside,
  className,
  contentClassName,
  asideClassName,
}: SectionLayoutProps) {
  return (
    <div className={cn("grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]", className)}>
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
      <div className={cn("min-w-0", asideClassName)}>{aside}</div>
    </div>
  );
}

export function SectionDiagnosticCard({
  icon: Icon,
  title,
  description,
  summary,
  metrics = [],
  status,
  className,
  summaryLabel = "ملخص الحالة",
}: SectionDiagnosticCardProps) {
  const statusAppearance = getStatusAppearance(status);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-5 shadow-sm",
        className
      )}
    >
      {status ? <div className={cn("absolute inset-y-0 right-0 w-[3px]", statusAppearance.strip)} /> : null}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
              status ? statusAppearance.iconWrap : "border-slate-200 bg-white"
            )}
          >
            <Icon className={cn("h-4 w-4", status ? statusAppearance.icon : "text-slate-800")} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
            <p className="text-xs leading-6 text-slate-500">{description}</p>
          </div>
        </div>

        {status ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold",
              statusAppearance.badge
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", statusAppearance.dot)} />
            <span>{getStatusLabel(status)}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-4 rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {summaryLabel}
        </p>
        <div className="mt-2 text-xs leading-6 text-slate-600">{summary}</div>
      </div>

      <div className="mt-5 grid gap-3">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            icon={metric.icon}
            label={metric.label}
            value={metric.value}
            status={metric.status}
          />
        ))}
      </div>
    </div>
  );
}

export function UploadDropzone({
  inputId,
  title,
  description,
  accept,
  multiple = false,
  disabled = false,
  onChange,
}: UploadDropzoneProps) {
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-8 text-center transition-all hover:border-slate-400 hover:bg-white",
        disabled &&
          "cursor-not-allowed opacity-60 hover:border-slate-300 hover:bg-slate-50/80"
      )}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={onChange}
      />
      <span className="flex size-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-transform group-hover:-translate-y-0.5">
        <UploadCloud className="h-5 w-5 text-slate-700" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs leading-6 text-slate-500">{description}</p>
      </div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
        {multiple ? "اختر ملفات" : "اختر ملفًا"}
      </span>
    </label>
  );
}
