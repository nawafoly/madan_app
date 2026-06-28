import { useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import EmployeeLayout from "@/components/EmployeeLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { markInAppNotificationsRead } from "@/lib/inAppNotifications";
import { tr } from "@/lib/i18n";
import { DailyTaskTab } from "@/pages/employee/messages/DailyTaskTab";
import { EMPLOYEE_NOTIFICATIONS_COLLECTION } from "@shared/employee";

export default function EmployeeDailyTasksPage() {
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
        const unreadIds = snapshot.docs
          .filter(docSnapshot => {
            const data = docSnapshot.data() as Record<string, unknown>;
            return data.relatedTo === "daily_task" && data.isRead !== true;
          })
          .map(docSnapshot => docSnapshot.id);

        if (unreadIds.length) {
          void markInAppNotificationsRead(unreadIds);
        }
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
