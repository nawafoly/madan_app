import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { UploadCloud } from "lucide-react";
import type {
  FieldProps,
  MetricCardProps,
  SectionCardProps,
  UploadDropzoneProps,
} from "./shared";

export function SectionCard({
  id,
  index,
  title,
  description,
  icon: Icon,
  children,
  headerAside,
  toneClassName,
}: SectionCardProps) {
  return (
    <Card
      id={id}
      className="scroll-mt-40 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur"
    >
      <CardHeader
        className={cn(
          "gap-4 border-b border-slate-200/70 pb-6",
          toneClassName ??
            "bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))]"
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/90 shadow-sm">
              <Icon className="h-5 w-5 text-slate-800" />
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
          {headerAside ? <div className="flex flex-wrap items-center gap-2">{headerAside}</div> : null}
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
  className,
}: MetricCardProps) {
  const dark = tone === "dark";

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 shadow-sm",
        dark ? "border-white/12 bg-white/8 text-white" : "border-slate-200/80 bg-slate-50/80",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]",
          dark ? "text-slate-200/80" : "text-slate-500"
        )}
      >
        <Icon className={cn("h-4 w-4", dark ? "text-amber-300" : "text-slate-500")} />
        <span>{label}</span>
      </div>
      <div className={cn("mt-2 text-sm font-semibold", dark ? "text-white" : "text-slate-950")}>
        {value}
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
