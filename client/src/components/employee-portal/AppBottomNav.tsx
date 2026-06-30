import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";

import { cn } from "@/lib/utils";

export type EmployeeBottomNavItem = {
  key: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: number | string | null;
  onClick?: () => void;
};

type AppBottomNavProps = {
  items: EmployeeBottomNavItem[];
  className?: string;
  dir?: "rtl" | "ltr";
  ariaLabel?: string;
};

function BottomNavContent({ item }: { item: EmployeeBottomNavItem }) {
  const Icon = item.icon;

  return (
    <span
      className={cn(
        "relative flex h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-xs font-medium transition",
        item.active ? "text-slate-950" : "text-slate-400"
      )}
    >
      <span
        className={cn(
          "relative flex h-7 w-10 items-center justify-center rounded-full transition",
          item.active && "bg-slate-100"
        )}
      >
        <Icon
          className={cn("h-6 w-6", item.active ? "stroke-[2.4]" : "stroke-2")}
        />
        {item.badge ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
            {item.badge}
          </span>
        ) : null}
      </span>
      <span className="w-full truncate text-center">{item.label}</span>
    </span>
  );
}

export default function AppBottomNav({
  items,
  className,
  dir = "rtl",
  ariaLabel = "Employee portal navigation",
}: AppBottomNavProps) {
  return (
    <nav
      dir={dir}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_38px_-28px_rgba(15,23,42,0.4)] backdrop-blur",
        className
      )}
      aria-label={ariaLabel}
    >
      <div className="mx-auto flex max-w-[520px] items-center justify-between gap-1">
        {items.map(item => {
          if (item.href) {
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={item.onClick}
                className="min-w-0 flex-1"
              >
                <BottomNavContent item={item} />
              </Link>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="min-w-0 flex-1"
            >
              <BottomNavContent item={item} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

