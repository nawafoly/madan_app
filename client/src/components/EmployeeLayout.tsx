import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  Menu,
  Mail,
  Send,
  X,
  UserRound,
} from "lucide-react";
import { Link, useLocation } from "wouter";

import { StaffWorkspaceHeader } from "@/components/StaffWorkspaceHeader";
import AppBottomNav from "@/components/employee-portal/AppBottomNav";
import FloatingNewRequestButton from "@/components/employee-portal/FloatingNewRequestButton";
import RequestBottomSheet, {
  type EmployeeRequestType,
} from "@/components/employee-portal/RequestBottomSheet";
import { getLoginUrl } from "@/const";
import { hasStaffAdminPermission, useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type EmployeeLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
  hideHero?: boolean;
};

export default function EmployeeLayout({
  title,
  description,
  children,
}: EmployeeLayoutProps) {
  const { language } = useLanguage();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [currentHash, setCurrentHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "")
  );
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const layoutDir: "rtl" | "ltr" = language === "ar" ? "rtl" : "ltr";
  const currentPath = location.split("?")[0];
  const canOpenHrPortal = user
    ? hasStaffAdminPermission(user, "recruitment.manage") ||
      hasStaffAdminPermission(user, "employees.manage") ||
      hasStaffAdminPermission(user, "weekly_reports.manager_notes") ||
      hasStaffAdminPermission(user, "settings.manage")
    : false;
  const employeeReturnPath = "/hr/recruitment";
  const employeeReturnLabel = tr(
    language,
    "منصة الموارد البشرية",
    "Human Resources"
  );
  const handleLogout = async () => {
    await logout();
    setLocation(getLoginUrl(currentPath));
  };

  const navigateToEmployeeAnchor = (anchor: string) => {
    setCurrentHash(anchor);

    if (currentPath !== "/employee/profile") {
      setLocation("/employee/profile");
      window.setTimeout(() => {
        window.location.hash = anchor;
      }, 0);
      return;
    }

    window.location.hash = anchor;
  };

  const handleRequestSelect = (type: EmployeeRequestType) => {
    if (type === "leave") {
      navigateToEmployeeAnchor("employee-leave-request");
      return;
    }

    if (type === "permission") {
      navigateToEmployeeAnchor("employee-permission-request");
      return;
    }

    if (type === "attendance_correction") {
      navigateToEmployeeAnchor("employee-attendance-correction-request");
      return;
    }

    if (type === "overtime") {
      navigateToEmployeeAnchor("employee-overtime-request");
      return;
    }

    if (type === "salary_advance") {
      navigateToEmployeeAnchor("employee-salary-advance-request");
      return;
    }

    if (type === "resignation") {
      navigateToEmployeeAnchor("employee-resignation-request");
      return;
    }

    if (type === "exit_reentry") {
      navigateToEmployeeAnchor("employee-exit-reentry-request");
      return;
    }

    if (type === "letters") {
      navigateToEmployeeAnchor("employee-letter-request");
    }
  };

  useEffect(() => {
    const updateHashState = () => {
      setCurrentHash(window.location.hash.replace(/^#/, ""));
    };

    updateHashState();
    window.addEventListener("hashchange", updateHashState);
    return () => window.removeEventListener("hashchange", updateHashState);
  }, [location]);

  const navItems = [
    {
      label: tr(language, "الملف الشخصي", "Profile"),
      href: "/employee/profile",
      icon: UserRound,
      active: currentPath === "/employee/profile",
    },
    {
      label: tr(language, "الملفات", "Files"),
      href: "/employee/files",
      icon: FileText,
      active: currentPath === "/employee/files",
    },
    {
      label: tr(language, "الرسائل", "Messages"),
      href: "/employee/messages?tab=hr",
      icon: Mail,
      active: currentPath === "/employee/messages",
    },
    {
      label: tr(language, "المهام اليومية", "Daily Tasks"),
      href: "/employee/daily-tasks",
      icon: CalendarDays,
      active: currentPath === "/employee/daily-tasks",
    },
    {
      label: tr(language, "تقرير العمل الأسبوعي", "Weekly Report"),
      href: "/employee/weekly-reports",
      icon: ClipboardList,
      active: currentPath === "/employee/weekly-reports",
    },
  ];
  const isEmployeeProfilePath = currentPath === "/employee/profile";
  const requestAnchors = new Set([
    "employee-requests",
    "employee-leave-request",
    "employee-permission-request",
    "employee-attendance-correction-request",
    "employee-overtime-request",
    "employee-salary-advance-request",
    "employee-resignation-request",
    "employee-exit-reentry-request",
    "employee-letter-request",
  ]);
  const innerViewAnchors = new Set([
    "employee-attendance",
    "employee-profile-info",
    "hr-info",
    "employee-employment-info",
    "employment",
    "employee-payroll-info",
    "salary",
    "employee-contracts-info",
    "contracts",
    "leaves",
    "employee-documents-info",
    "documents",
    ...Array.from(requestAnchors),
  ]);
  const hasFocusedProfileSection =
    innerViewAnchors.has(currentHash) && currentHash !== "dashboard";
  const hasActiveMenuPage = navItems.some(
    item => item.href !== "/employee/profile" && item.active
  );
  const isMenuInnerView =
    currentHash === "hr-info" ||
    currentHash === "employee-employment-info" ||
    currentHash === "employment" ||
    currentHash === "employee-payroll-info" ||
    currentHash === "salary" ||
    currentHash === "employee-contracts-info" ||
    currentHash === "contracts" ||
    currentHash === "leaves" ||
    currentHash === "employee-documents-info" ||
    currentHash === "documents";
  const navigateToEmployeeHome = () => {
    setCurrentHash("");
    setLocation("/employee/profile");

    if (typeof window === "undefined") return;

    window.history.replaceState(null, "", "/employee/profile");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const bottomNavItems = [
    {
      key: "home",
      label: tr(language, "الرئيسية", "Home"),
      icon: Home,
      active: isEmployeeProfilePath && !hasFocusedProfileSection,
      onClick: navigateToEmployeeHome,
    },
    {
      key: "attendance",
      label: tr(language, "الحضور", "Attendance"),
      icon: CalendarCheck2,
      active: isEmployeeProfilePath && currentHash === "employee-attendance",
      onClick: () => navigateToEmployeeAnchor("employee-attendance"),
    },
    {
      key: "requests",
      label: tr(language, "الطلبات", "Requests"),
      icon: Send,
      active: isEmployeeProfilePath && requestAnchors.has(currentHash),
      onClick: () => navigateToEmployeeAnchor("employee-requests"),
    },
    {
      key: "profile",
      label: tr(language, "الملف الشخصي", "Profile"),
      icon: UserRound,
      active: isEmployeeProfilePath && currentHash === "employee-profile-info" && !navSheetOpen,
      onClick: () => navigateToEmployeeAnchor("employee-profile-info"),
    },
    {
      key: "menu",
      label: tr(language, "المزيد", "More"),
      icon: Menu,
      active: navSheetOpen || hasActiveMenuPage || (isEmployeeProfilePath && isMenuInnerView),
      onClick: () => setNavSheetOpen(true),
    },
  ];
  void title;
  void description;
  const portalNavSheet = navSheetOpen ? (
    <div className="pointer-events-none fixed inset-0 z-[90]" dir={layoutDir} role="presentation">
      <div
        data-theme-overlay="true"
        className="pointer-events-none absolute inset-0 bg-slate-950/55"
        aria-hidden="true"
      />

      <section
        role="dialog"
        aria-modal="false"
        aria-label={tr(language, "قائمة بوابة الموظف", "Employee portal menu")}
        className="pointer-events-auto absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[28px] bg-white shadow-[0_-24px_70px_-28px_rgba(15,23,42,0.55)]"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={() => setNavSheetOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
            aria-label={tr(language, "إغلاق", "Close")}
          >
            <X className="h-6 w-6" />
          </button>
          <h2 className="text-lg font-semibold text-slate-950">
            {tr(language, "القائمة", "Menu")}
          </h2>
          <span className="h-11 w-11" aria-hidden="true" />
        </div>

        <nav
          aria-label={tr(language, "روابط بوابة الموظف", "Employee portal links")}
          className="grid gap-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
        >
          {navItems
            .filter(item => item.href !== "/employee/profile")
            .map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setNavSheetOpen(false)}
                className={cn(
                  "flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 text-sm font-semibold transition",
                  item.active
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-100 bg-slate-50/70 text-slate-700 hover:border-slate-200 hover:bg-white hover:text-slate-950"
                )}
              >
                <span>{item.label}</span>
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
      </section>
    </div>
  ) : null;

  return (
    <div
      dir={layoutDir}
      className="employee-shell min-h-screen bg-[linear-gradient(180deg,#f8f4ea_0%,#ffffff_20%,#f8fafc_100%)] text-slate-950"
    >
      <StaffWorkspaceHeader
        title={tr(language, "بوابة الموظف", "Employee Portal")}
        subtitle={tr(
          language,
          "الدوام، الإجازات، الملفات والرسائل",
          "Attendance, leave, files, and messages"
        )}
        switchHref={canOpenHrPortal ? employeeReturnPath : undefined}
        switchLabel={canOpenHrPortal ? employeeReturnLabel : undefined}
        switchIcon={canOpenHrPortal ? Home : undefined}
        showNotifications={Boolean(user)}
        onLogout={user ? handleLogout : undefined}
      />

      <main className="employee-page-motion pb-36 pt-8">
        <div className="mx-auto w-full max-w-none space-y-8 px-4 sm:px-6 lg:px-8 2xl:px-10">
          {children}
        </div>
      </main>

      {user ? (
        <>
          <FloatingNewRequestButton
            onClick={() => setRequestSheetOpen(true)}
            label={tr(language, "طلب جديد", "New Request")}
          />
          <AppBottomNav
            items={bottomNavItems}
            dir={layoutDir}
            ariaLabel={tr(
              language,
              "تنقل بوابة الموظف",
              "Employee portal navigation"
            )}
          />
          {portalNavSheet}
          <RequestBottomSheet
            open={requestSheetOpen}
            onOpenChange={setRequestSheetOpen}
            onSelect={handleRequestSelect}
            language={language}
          />
        </>
      ) : null}
    </div>
  );
}
