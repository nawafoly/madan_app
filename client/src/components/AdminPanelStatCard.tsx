import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type AdminPanelStatAccent = "amber" | "emerald" | "blue" | "rose" | "slate";
type AdminPanelStatDensity = "default" | "compact";

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
  density?: AdminPanelStatDensity;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  iconClassName?: string;
  bodyClassName?: string;
  helperClassName?: string;
  valueClassName?: string;
};

export default function AdminPanelStatCard({
  title,
  value,
  description,
  helper,
  icon,
  accent = "amber",
  density = "default",
  className,
  contentClassName,
  headerClassName,
  titleClassName,
  descriptionClassName,
  iconClassName,
  bodyClassName,
  helperClassName,
  valueClassName,
}: AdminPanelStatCardProps) {
  const displayValue = typeof value === "number" ? formatNumberEN(value) : value;
  const isCompact = density === "compact";

  return (
    <Card
      className={cn(
        "relative overflow-hidden border border-[#112255] bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.18),transparent_32%),linear-gradient(135deg,#020617_0%,#08122f_45%,#030640_100%)] text-white",
        isCompact
          ? "rounded-[24px] shadow-[0_22px_55px_-38px_rgba(15,23,42,0.6)]"
          : "rounded-[28px] shadow-xl shadow-slate-950/10",
        className
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_36%,transparent_70%)]" />

      <CardContent
        className={cn(
          "relative flex flex-col",
          isCompact
            ? "min-h-[152px] gap-4 px-4 py-4 sm:min-h-[160px] sm:px-5 sm:py-5"
            : "min-h-[188px] justify-between px-5 py-5 sm:px-6 sm:py-6",
          contentClassName
        )}
      >
        <div
          className={cn(
            "flex items-start justify-between",
            isCompact ? "gap-3" : "gap-4",
            headerClassName
          )}
        >
          <div className={cn(isCompact ? "space-y-1.5" : "space-y-2.5")}>
            <div
              className={cn(
                isCompact
                  ? "text-[13px] font-semibold tracking-[0.03em] text-white/74 sm:text-sm"
                  : "text-sm font-medium tracking-[0.04em] text-white/72",
                titleClassName
              )}
            >
              {title}
            </div>
            {description ? (
              <p
                className={cn(
                  "max-w-xl text-white/65",
                  isCompact ? "text-[11px] leading-5 sm:text-xs" : "text-xs leading-6 sm:text-sm",
                  descriptionClassName
                )}
              >
                {description}
              </p>
            ) : null}
          </div>

          {icon ? (
            <div
              className={cn(
                "flex shrink-0 items-center justify-center border backdrop-blur-sm",
                isCompact
                  ? "h-10 w-10 rounded-[18px] [&_svg]:h-[18px] [&_svg]:w-[18px]"
                  : "h-12 w-12 rounded-2xl [&_svg]:h-5 [&_svg]:w-5",
                accentMap[accent],
                iconClassName
              )}
            >
              {icon}
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            isCompact ? "mt-1 space-y-2.5" : "mt-6 space-y-3",
            bodyClassName
          )}
        >
          <div
            className={cn(
              "break-words font-semibold tracking-tight text-white",
              isCompact
                ? "text-[1.85rem] leading-none sm:text-[2.15rem]"
                : "text-3xl sm:text-4xl",
              valueClassName
            )}
          >
            {displayValue}
          </div>

          {helper ? (
            <div
              className={cn(
                "border border-white/10 bg-black/10 text-white/68",
                isCompact
                  ? "rounded-[18px] px-3.5 py-2 text-[11px] leading-5 sm:text-xs"
                  : "rounded-2xl px-4 py-2.5 text-xs leading-6 sm:text-sm",
                helperClassName
              )}
            >
              {helper}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
