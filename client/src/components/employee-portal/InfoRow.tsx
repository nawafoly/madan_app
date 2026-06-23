import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

type InfoRowProps = {
  icon?: LucideIcon;
  label: string;
  value?: ReactNode;
  helper?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  valueClassName?: string;
  dir?: "rtl" | "ltr";
};

export default function InfoRow({
  icon: Icon,
  label,
  value,
  helper,
  action,
  onClick,
  disabled = false,
  className,
  valueClassName,
  dir = "rtl",
}: InfoRowProps) {
  const interactive = Boolean(onClick) && !disabled;
  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={onClick ? disabled : undefined}
      dir={dir}
      className={cn(
        "group flex w-full items-center gap-3 border-b border-slate-100 bg-white px-5 py-4 text-start last:border-b-0",
        interactive && "transition hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-55",
        className
      )}
    >
      {Icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 ring-1 ring-slate-100">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-slate-900">
          {label}
        </span>
        {helper ? (
          <span className="mt-1 block truncate text-sm leading-6 text-slate-500">
            {helper}
          </span>
        ) : null}
      </span>

      {value !== undefined ? (
        <span
          className={cn(
            "min-w-0 max-w-[45%] truncate text-sm font-medium text-slate-700",
            valueClassName
          )}
        >
          {value}
        </span>
      ) : null}

      {action || (onClick ? (
        <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-slate-700" />
      ) : null)}
    </Comp>
  );
}

