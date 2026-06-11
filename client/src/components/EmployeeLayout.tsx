import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  BriefcaseBusiness,
  Globe,
  Home,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, useLocation } from "wouter";

import { NotificationBell } from "@/components/NotificationBell";
import { HrBrandMark } from "@/components/HrBrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hasStaffAdminPermission, useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { safeEnglishText, tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type EmployeeLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export default function EmployeeLayout({
  title,
  description,
  children,
}: EmployeeLayoutProps) {
  const { language, toggleLanguage } = useLanguage();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [isNavFloating, setIsNavFloating] = useState(false);
  const layoutDir: "rtl" | "ltr" = language === "ar" ? "rtl" : "ltr";
  const languageToggleLabel = language === "ar" ? "English" : "Arabic";
  const currentPath = location.split("?")[0];
  const employeeReturnPath = user
    ? hasStaffAdminPermission(user, "recruitment.view") ||
      hasStaffAdminPermission(user, "recruitment.manage")
      ? "/hr/recruitment"
      : hasStaffAdminPermission(user, "employees.view") ||
          hasStaffAdminPermission(user, "employees.manage")
        ? "/hr/employees"
        : hasStaffAdminPermission(user, "settings.manage")
          ? "/hr/settings"
          : "/hr"
    : "/hr";
  const employeeReturnLabel =
    employeeReturnPath === "/hr"
      ? tr(language, "بوابة الموظفين", "Staff Portal")
      : tr(language, "لوحة HR", "HR Dashboard");

  const handleLogout = async () => {
    await logout();
    setLocation("/hr");
  };

  useEffect(() => {
    const updateFloatingState = () => {
      setIsNavFloating(window.scrollY > 180);
    };

    updateFloatingState();
    window.addEventListener("scroll", updateFloatingState, { passive: true });
    return () => window.removeEventListener("scroll", updateFloatingState);
  }, []);

  const navItems = [
    {
      label: tr(language, "الملف الشخصي", "Profile"),
      href: "/hr/profile",
      icon: UserRound,
      active: currentPath === "/hr/profile",
    },
    {
      label: tr(language, "الملفات", "Files"),
      href: "/hr/files",
      icon: FileText,
      active: currentPath === "/hr/files",
    },
    {
      label: tr(language, "الرسائل", "Messages"),
      href: "/hr/messages?tab=hr",
      icon: Mail,
      active: currentPath === "/hr/messages",
    },
    {
      label: tr(language, "تقرير العمل الأسبوعي", "Weekly Report"),
      href: "/hr/weekly-reports",
      icon: ClipboardList,
      active: currentPath === "/hr/weekly-reports",
    },
  ];
  const displayTitle =
    language === "ar" ? title : safeEnglishText(title, "Employee Portal");
  const displayDescription =
    language === "ar"
      ? description
      : safeEnglishText(
          description,
          "Review your personal profile, files, and internal messages."
        );
  const navLinks = (
    <nav
      aria-label={tr(language, "روابط بوابة الموظف", "Employee portal links")}
      className={cn(
        "pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-slate-200/80 p-1 backdrop-blur-xl transition-[background-color,box-shadow,transform] duration-300 ease-out will-change-transform",
        isNavFloating
          ? "bg-white/90 shadow-[0_20px_54px_-34px_rgba(15,23,42,0.42)] supports-[backdrop-filter]:bg-white/75"
          : "bg-white/80 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.28)] supports-[backdrop-filter]:bg-white/70"
      )}
    >
      {navItems.map(item => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-all duration-200 ease-out sm:px-4",
              item.active
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-white hover:text-slate-950"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div
      dir={layoutDir}
      className="min-h-screen bg-[linear-gradient(180deg,#f8f4ea_0%,#ffffff_20%,#f8fafc_100%)] text-slate-950"
    >
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 shadow-sm shadow-slate-950/[0.03] backdrop-blur-xl">
        <div className="container flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          <Link
            href={employeeReturnPath}
            className="flex min-w-0 items-center gap-3 text-slate-950"
          >
            <HrBrandMark
              alt={tr(language, "شعار معدن", "MAEDIN logo")}
              compact
              className="h-10 w-10"
              imageClassName="h-9 w-9"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {tr(language, "بوابة الموظف", "Employee Portal")}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {tr(
                  language,
                  "الدوام، الإجازات، الملفات والرسائل",
                  "Attendance, leave, files, and messages"
                )}
              </span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {user ? (
              <NotificationBell triggerClassName="rounded-xl text-slate-700 hover:bg-slate-100" />
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleLanguage}
              className="h-10 rounded-xl border-slate-200 bg-white"
              aria-label={tr(language, "تبديل اللغة", "Toggle language")}
            >
              <Globe className="h-4 w-4" />
              {languageToggleLabel}
            </Button>

            <Link href={employeeReturnPath}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-xl border-slate-200 bg-white"
              >
                <Home className="h-4 w-4" />
                {employeeReturnLabel}
              </Button>
            </Link>

            {user ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleLogout()}
                className="h-10 rounded-xl border-red-200 bg-red-50/80 px-3.5 font-semibold text-red-600 shadow-sm shadow-red-100/40 hover:border-red-300 hover:bg-red-100/80 hover:text-red-700"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/70 text-red-600 ring-1 ring-red-200">
                  <LogOut
                    className={cn("h-4 w-4", language === "ar" && "rotate-180")}
                  />
                </span>
                {tr(language, "خروج", "Logout")}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="pb-16 pt-8">
        <div className="container space-y-8">
          <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.95)_52%,rgba(245,235,214,0.45)_100%)] px-6 py-7 shadow-[0_30px_90px_-48px_rgba(15,23,42,0.24)] sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={employeeReturnPath}>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-10 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(15,23,42,0.5)] hover:bg-slate-900"
                    >
                      <ArrowLeft
                        className={cn(
                          "h-4 w-4",
                          language === "en" && "rotate-180"
                        )}
                      />
                      {tr(language, "العودة للوحة HR", "Back To HR")}
                    </Button>
                  </Link>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full border border-[#F2B705]/35 bg-[#F2B705]/12 px-4 py-1.5 text-[#8b6700] shadow-none">
                    <BriefcaseBusiness className="ml-2 h-4 w-4" />
                    {tr(language, "بوابة الموظف", "Employee Portal")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white/80 px-4 py-1.5 text-slate-600 shadow-none"
                  >
                    <ShieldCheck className="ml-2 h-4 w-4" />
                    {tr(language, "وصول شخصي فقط", "Personal Access Only")}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.3rem]">
                    {displayTitle}
                  </h1>
                  <p className="max-w-3xl text-sm leading-8 text-slate-600 sm:text-[15px]">
                    {displayDescription}
                  </p>
                </div>

              </div>
            </div>
          </section>

          <div className="-mt-5 h-14">
            {isNavFloating ? (
              <div className="fixed inset-x-0 top-3 z-[70] pointer-events-none">
                <div className="container flex justify-start">{navLinks}</div>
              </div>
            ) : (
              <div className="relative z-30 flex justify-start py-1">
                {navLinks}
              </div>
            )}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
