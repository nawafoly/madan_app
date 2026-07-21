import { CalendarDays } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { listInAppNotifications, markInAppNotificationsRead } from "@/lib/inAppNotifications";
import { tr } from "@/lib/i18n";
import { DailyTaskTab } from "@/pages/employee/messages/DailyTaskTab";

export default function HrDailyTasksPage() {
  const { user } = useAuth();
  const { language } = useLanguage();

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    void listInAppNotifications(user.uid)
      .then(items => {
        if (cancelled) return;
        const unreadIds = items
          .filter(item => item.relatedTo === "daily_task" && !item.isRead)
          .map(item => item.id);
        if (unreadIds.length) void markInAppNotificationsRead(unreadIds);
      })
      .catch(error => {
        console.error("hr_daily_task_notifications_mark_read_failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  if (!user) return null;

  return (
    <DashboardLayout area="hr">
      <div className="space-y-6" dir="rtl">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
          <div className="grid gap-5 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_54%,#fff8e8_100%)] px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-6">
            <div className="min-w-0">
              <Badge className="rounded-full bg-slate-950 px-3 py-1.5 text-[#F2B705] shadow-none hover:bg-slate-950">
                <CalendarDays className="h-4 w-4" />
                {tr(language, "المهام اليومية", "Daily Tasks")}
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
                {tr(language, "متابعة المهام اليومية", "Daily Tasks Review")}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
                {tr(
                  language,
                  "مساحة بسيطة لاستقبال تحديثات الموظفين اليومية والصور المرفقة عند الحاجة.",
                  "A simple space for receiving daily staff updates and optional photos."
                )}
              </p>
            </div>
          </div>
        </section>

        <DailyTaskTab user={user} mode="admin" />
      </div>
    </DashboardLayout>
  );
}
