import type { LucideIcon } from "lucide-react";
import { Languages, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

import { HrBrandMark } from "@/components/HrBrandMark";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type StaffWorkspaceHeaderProps = {
  title: string;
  subtitle: string;
  switchHref?: string;
  switchLabel?: string;
  switchIcon?: LucideIcon;
  menuTrigger?: ReactNode;
  showBrand?: boolean;
  showNotifications?: boolean;
  onLogout?: () => void | Promise<void>;
};

export function StaffWorkspaceHeader({
  title,
  subtitle,
  switchHref,
  switchLabel,
  switchIcon: SwitchIcon,
  menuTrigger,
  showBrand = true,
  showNotifications = true,
  onLogout,
}: StaffWorkspaceHeaderProps) {
  const { language, toggleLanguage } = useLanguage();
  const languageToggleLabel = language === "ar" ? "English" : "العربية";
  const compactLanguageLabel = language === "ar" ? "EN" : "ع";

  const actionButtons = (
    <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
      {showNotifications ? (
        <NotificationBell triggerClassName="h-10 w-10 rounded-full border border-slate-200 bg-white p-0 text-slate-700 shadow-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 [&_svg]:text-current" />
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={toggleLanguage}
        className="h-10 min-w-10 gap-1.5 rounded-full border-slate-200 bg-white px-2.5 text-slate-700 shadow-none hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 sm:px-3"
        aria-label={tr(language, "تبديل اللغة", "Toggle language")}
      >
        <Languages className="h-4 w-4 shrink-0 text-current" />
        <span className="text-[11px] font-black sm:hidden">
          {compactLanguageLabel}
        </span>
        <span className="hidden text-xs font-semibold sm:inline">
          {languageToggleLabel}
        </span>
      </Button>

      {switchHref && switchLabel && SwitchIcon ? (
        <Link href={switchHref}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 min-w-10 gap-1.5 rounded-full border-amber-300/80 bg-amber-50 px-2.5 text-sm font-semibold text-slate-900 shadow-none hover:border-amber-400 hover:bg-amber-100 dark:border-amber-400/45 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:bg-amber-400/16 sm:px-4"
            aria-label={switchLabel}
          >
            <SwitchIcon className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <span className="hidden sm:inline">{switchLabel}</span>
          </Button>
        </Link>
      ) : null}

      {onLogout ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onLogout()}
          className="h-10 min-w-10 rounded-full border-red-200 bg-red-50/80 px-2.5 font-semibold text-red-600 shadow-none hover:border-red-300 hover:bg-red-100/80 hover:text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/16 sm:px-3.5"
          aria-label={tr(language, "خروج", "Logout")}
        >
          <LogOut
            className={cn(
              "h-4 w-4 shrink-0 text-current",
              language === "ar" && "rotate-180"
            )}
          />
          <span className="hidden sm:inline">
            {tr(language, "خروج", "Logout")}
          </span>
        </Button>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/92">
      <div
        dir={language === "ar" ? "rtl" : "ltr"}
        className="mx-auto flex min-h-16 w-full max-w-none items-center justify-between gap-3 px-3 py-2.5 sm:px-6 lg:px-8 2xl:px-10"
      >
        {showBrand ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 text-slate-950 dark:text-slate-50 sm:gap-3">
            <HrBrandMark
              alt={tr(language, "شعار معدن", "MAEDIN logo")}
              compact
              className="h-11 w-11 shrink-0 rounded-2xl bg-white ring-1 ring-slate-200/80"
              imageClassName="h-9 w-9"
            />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold">{title}</span>
              <span className="mt-0.5 hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
                {subtitle}
              </span>
            </span>
          </div>
        ) : (
          <div className="flex shrink-0 items-center">
            {menuTrigger ? (
              <span className="flex shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-slate-700 dark:[&_svg]:text-slate-100">
                {menuTrigger}
              </span>
            ) : null}
          </div>
        )}

        {showBrand && menuTrigger ? (
          <span className="flex shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-slate-700 dark:[&_svg]:text-slate-100">
            {menuTrigger}
          </span>
        ) : null}

        {actionButtons}
      </div>
    </header>
  );
}
