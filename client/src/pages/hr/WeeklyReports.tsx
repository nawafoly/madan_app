import { ClipboardList } from "lucide-react";

import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { tr } from "@/lib/i18n";
import { WeeklyReportTab } from "@/pages/employee/messages/WeeklyReportTab";

export default function HrWeeklyReportsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();

  if (!user) return null;

  return (
    <DashboardLayout area="hr">
      <div className="space-y-6" dir="rtl">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
          <div className="grid gap-5 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_54%,#fff8e8_100%)] px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-6">
            <div className="min-w-0">
              <Badge className="rounded-full bg-slate-950 px-3 py-1.5 text-[#F2B705] shadow-none hover:bg-slate-950">
                <ClipboardList className="h-4 w-4" />
                {tr(language, "إدارة التقارير", "Reports Management")}
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
                {tr(language, "إدارة التقارير الأسبوعية", "Weekly Reports Management")}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
                {tr(
                  language,
                  "صفحة إدارية لاستقبال تقارير الموظفين الأسبوعية، مراجعتها، حفظ ملاحظات المدير، وتصدير التقرير عند الحاجة.",
                  "An admin workspace for receiving weekly staff reports, reviewing them, saving manager notes, and exporting reports."
                )}
              </p>
            </div>
          </div>
        </section>

        <WeeklyReportTab user={user} mode="admin" />
      </div>
    </DashboardLayout>
  );
}
