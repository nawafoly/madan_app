import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type AdminPanelStatAccent = "amber" | "emerald" | "blue" | "rose" | "slate";

const accentMap: Record<AdminPanelStatAccent, string> = {
  amber: "border-[#F2B705]/25 bg-[#F2B705]/10 text-[#F2B705]",
  emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  blue: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  rose: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  slate: "border-white/15 bg-white/5 text-white/80",
};

type AdminPanelStatCardProps = {
  title: string;
  value: string | number | ReactNode;
  description?: string;
  helper?: ReactNode;
  icon?: ReactNode;
  accent?: AdminPanelStatAccent;
  className?: string;
  valueClassName?: string;
};

export default function AdminPanelStatCard({
  title,
  value,
  description,
  helper,
  icon,
  accent = "amber",
  className,
  valueClassName,
}: AdminPanelStatCardProps) {
  const displayValue = typeof value === "number" ? formatNumberEN(value) : value;

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-[#112255] bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.18),transparent_32%),linear-gradient(135deg,#020617_0%,#08122f_45%,#030640_100%)] text-white shadow-xl shadow-slate-950/10",
        className
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_36%,transparent_70%)]" />

      <CardContent className="relative flex min-h-[188px] flex-col justify-between px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2.5">
            <div className="text-sm font-medium tracking-[0.04em] text-white/72">{title}</div>
            {description ? (
              <p className="max-w-xl text-xs leading-6 text-white/65 sm:text-sm">{description}</p>
            ) : null}
          </div>

          {icon ? (
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-sm",
                accentMap[accent]
              )}
            >
              {icon}
            </div>
          ) : null}
        </div>

        <div className="mt-6 space-y-3">
          <div
            className={cn(
              "break-words text-3xl font-semibold tracking-tight text-white sm:text-4xl",
              valueClassName
            )}
          >
            {displayValue}
          </div>

          {helper ? (
            <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-2.5 text-xs leading-6 text-white/68 sm:text-sm">
              {helper}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
