import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import EmployeeLayout from "@/components/EmployeeLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { listInAppNotifications, markInAppNotificationsRead } from "@/lib/inAppNotifications";
import { tr } from "@/lib/i18n";
import { WeeklyReportTab } from "@/pages/employee/messages/WeeklyReportTab";

export default function EmployeeWeeklyReportsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    void listInAppNotifications(user.uid)
      .then(items => {
        if (cancelled) return;
        const unreadIds = items
          .filter(item => item.relatedTo === "weekly_report" && !item.isRead)
          .map(item => item.id);
        if (unreadIds.length) void markInAppNotificationsRead(unreadIds);
      })
      .catch(error => {
        console.error("weekly_report_notifications_mark_read_failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  if (!user) return null;

  return (
    <EmployeeLayout
      title={tr(language, "التقارير الأسبوعية", "Weekly Reports")}
      description={tr(
        language,
        "إرسال ومراجعة تقرير العمل الأسبوعي مع فصل ملاحظات المدير المباشر عن الرسائل الداخلية.",
        "Submit and review weekly work reports with manager notes separated from internal messages."
      )}
    >
      <WeeklyReportTab user={user} mode="employee" />
    </EmployeeLayout>
  );
}
