import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import EmployeeLayout from "@/components/EmployeeLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { listInAppNotifications, markInAppNotificationsRead } from "@/lib/inAppNotifications";
import { tr } from "@/lib/i18n";
import { DailyTaskTab } from "@/pages/employee/messages/DailyTaskTab";

export default function EmployeeDailyTasksPage() {
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
        console.error("daily_task_notifications_mark_read_failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  if (!user) return null;

  return (
    <EmployeeLayout
      title={tr(language, "المهام اليومية", "Daily Tasks")}
      description={tr(
        language,
        "إرسال تحديث يومي بسيط مع صورة اختيارية عند الحاجة.",
        "Send a simple daily update with an optional photo when needed."
      )}
    >
      <DailyTaskTab user={user} mode="employee" />
    </EmployeeLayout>
  );
}
