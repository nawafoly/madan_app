import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmployeeCardProps = {
  icon?: LucideIcon;
  title?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  contentClassName?: string;
};

export default function EmployeeCard({
  icon: Icon,
  title,
  subtitle,
  meta,
  action,
  footer,
  children,
  className,
  bodyClassName,
  contentClassName,
}: EmployeeCardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-[0_18px_45px_-32px_rgba(15,23,42,0.38)]",
        className
      )}
    >
      {(Icon || title || subtitle || meta || action) ? (
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-100">
                <Icon className="h-6 w-6" />
              </span>
            ) : null}

            <div className="min-w-0">
              {meta ? (
                <div className="mb-1 text-xs font-medium text-slate-400">
                  {meta}
                </div>
              ) : null}
              {title ? (
                <h3 className="truncate text-lg font-semibold text-slate-950">
                  {title}
                </h3>
              ) : null}
              {subtitle ? (
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>

          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      {children ? (
        <div className={cn("px-5 py-5", bodyClassName)}>
          <div className={contentClassName}>{children}</div>
        </div>
      ) : null}

      {footer ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

