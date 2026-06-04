import type { ReactNode } from "react";
import {
  ClipboardList,
  FileText,
  BriefcaseBusiness,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";

import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";
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
  const [location] = useLocation();
  const [search] = useSearch();
  const layoutDir: "rtl" | "ltr" = language === "ar" ? "rtl" : "ltr";
  const currentPath = location.split("?")[0];
  const safeSearch = typeof search === "string" ? search : "";
  const currentSearchParams = new URLSearchParams(
    safeSearch.startsWith("?") ? safeSearch.slice(1) : safeSearch
  );
  const currentMessageTab =
    currentSearchParams.get("tab")?.trim().toLowerCase() || "";
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
      path: "/employee/messages?tab=hr",
      icon: Mail,
    },
    {
      label: "تقرير العمل الأسبوعي",
      path: "/employee/messages?tab=weekly_report",
      icon: ClipboardList,
    },
  ];

  return (
    <div
      dir={layoutDir}
      className="min-h-screen bg-[linear-gradient(180deg,#f8f4ea_0%,#ffffff_20%,#f8fafc_100%)] text-slate-950"
    >
      <Header />

      <main className="pb-16 pt-24">
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
                    const itemPath = item.path.split("?")[0];
                    const isMessagesSection = itemPath === "/employee/messages";
                    const isWeeklyReportItem = item.path.includes("tab=weekly_report");
                    const isActive = isMessagesSection
                      ? currentPath === "/employee/messages" &&
                        (isWeeklyReportItem
                          ? currentMessageTab === "weekly_report"
                          : currentMessageTab !== "weekly_report")
                      : currentPath === itemPath;
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

      <Footer />
    </div>
  );
}
