import type { ReactNode } from "react";
import {
  FileText,
  BriefcaseBusiness,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, useLocation } from "wouter";

import { NotificationBell } from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getHomePathForUser, useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
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
  const { language } = useLanguage();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const layoutDir: "rtl" | "ltr" = language === "ar" ? "rtl" : "ltr";
  const workspacePath = user ? getHomePathForUser(user) : "/login";
  const showWorkspaceLink =
    !!user &&
    workspacePath !== "/employee/profile" &&
    workspacePath !== location;

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const navItems = [
    {
      label: "الملف الشخصي",
      path: "/employee/profile",
      icon: UserRound,
    },
    {
      label: "الملفات",
      path: "/employee/files",
      icon: FileText,
    },
    {
      label: "الرسائل",
      path: "/employee/messages",
      icon: Mail,
    },
  ];

  return (
    <div
      dir={layoutDir}
      className="min-h-screen bg-[linear-gradient(180deg,#f8f4ea_0%,#ffffff_20%,#f8fafc_100%)] text-slate-950"
    >
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 shadow-sm shadow-slate-950/[0.03] backdrop-blur-xl">
        <div className="container flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          <Link
            href="/employee/profile"
            className="flex min-w-0 items-center gap-3 text-slate-950"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-[#F2B705]">
              <BriefcaseBusiness className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                بوابة الموظف
              </span>
              <span className="block truncate text-xs text-slate-500">
                الدوام، الإجازات، الملفات والرسائل
              </span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {user ? (
              <NotificationBell triggerClassName="rounded-xl text-slate-700 hover:bg-slate-100" />
            ) : null}

            {showWorkspaceLink ? (
              <Link href={workspacePath}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-xl border-slate-200 bg-white"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  مساحة العمل
                </Button>
              </Link>
            ) : null}

            <Link href="/">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-xl border-slate-200 bg-white"
              >
                <Home className="h-4 w-4" />
                الموقع
              </Button>
            </Link>

            {user ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleLogout()}
                className="h-10 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              >
                <LogOut className="h-4 w-4" />
                خروج
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
                  <Badge className="rounded-full border border-[#F2B705]/35 bg-[#F2B705]/12 px-4 py-1.5 text-[#8b6700] shadow-none">
                    <BriefcaseBusiness className="ml-2 h-4 w-4" />
                    بوابة الموظف
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white/80 px-4 py-1.5 text-slate-600 shadow-none"
                  >
                    <ShieldCheck className="ml-2 h-4 w-4" />
                    وصول شخصي فقط
                  </Badge>
                </div>

                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.3rem]">
                    {title}
                  </h1>
                  <p className="max-w-3xl text-sm leading-8 text-slate-600 sm:text-[15px]">
                    {description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {navItems.map(item => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                          isActive
                            ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                            : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {children}
        </div>
      </main>
    </div>
  );
}
