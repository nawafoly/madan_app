import { useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import EmployeeLayout from "@/components/EmployeeLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { markInAppNotificationsRead } from "@/lib/inAppNotifications";
import { tr } from "@/lib/i18n";
import { WeeklyReportTab } from "@/pages/employee/messages/WeeklyReportTab";
import { EMPLOYEE_NOTIFICATIONS_COLLECTION } from "@shared/employee";

export default function EmployeeWeeklyReportsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();

  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;

    void getDocs(
      query(
        collection(db, EMPLOYEE_NOTIFICATIONS_COLLECTION),
        where("targetUid", "==", user.uid)
      )
    )
      .then(snapshot => {
        if (cancelled) return;
        const unreadWeeklyReportIds = snapshot.docs
          .filter(docSnapshot => {
            const data = docSnapshot.data() as Record<string, unknown>;
            return (
              data.relatedTo === "weekly_report" &&
              data.isRead !== true
            );
          })
          .map(docSnapshot => docSnapshot.id);

        if (unreadWeeklyReportIds.length) {
          void markInAppNotificationsRead(unreadWeeklyReportIds);
        }
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
      <WeeklyReportTab user={user} />
    </EmployeeLayout>
  );
}
