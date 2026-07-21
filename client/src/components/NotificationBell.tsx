import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Bell, CalendarDays, FileText, Mail, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EmployeeNotificationType } from "@shared/employee";
import {
  listInAppNotifications,
  markInAppNotificationRead,
  markInAppNotificationsRead,
  type InAppNotificationRecord,
} from "@/lib/inAppNotifications";

function getNotificationIcon(type: EmployeeNotificationType | null | undefined) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "leave") return CalendarDays;
  if (normalized === "file") return FileText;
  if (normalized === "message") return Mail;
  return ShieldCheck;
}

type NotificationBellProps = {
  triggerClassName?: string;
};

export function NotificationBell({ triggerClassName = "" }: NotificationBellProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotificationRecord[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      return;
    }

    let active = true;
    const load = async () => {
      try {
        const rows = await listInAppNotifications(user.uid);
        if (active) setItems(rows);
      } catch (error) {
        console.error("in_app_notifications_load_error", error);
        if (active) setItems([]);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user?.uid]);

  const unreadCount = items.filter(notification => !notification.isRead).length;

  const handleOpenNotification = async (notification: InAppNotificationRecord) => {
    try {
      if (!notification.isRead) {
        await markInAppNotificationRead(notification.id);
      }
    } catch (error) {
      console.error("mark_notification_read_failed", error);
    } finally {
      setOpen(false);
      setLocation(notification.targetPath || "/employee/profile");
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = items.filter(notification => !notification.isRead).map(item => item.id);
    if (!unreadIds.length) return;

    setMarkingAll(true);
    try {
      await markInAppNotificationsRead(unreadIds);
    } catch (error) {
      console.error("mark_all_notifications_read_failed", error);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={`relative ${triggerClassName}`}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="rsg-notification-badge absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">التنبيهات</div>
            <div className="text-xs text-slate-500">
              {unreadCount > 0 ? `${unreadCount} غير مقروء` : "كل التنبيهات مقروءة"}
            </div>
          </div>

          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => void handleMarkAllAsRead()}
              disabled={markingAll}
            >
              {markingAll ? "جارٍ التحديث..." : "تحديد الكل كمقروء"}
            </Button>
          ) : null}
        </div>

        <ScrollArea className="h-[420px]">
          {items.length ? (
            <div className="space-y-2 p-3">
              {items.map(notification => {
                const Icon = getNotificationIcon(notification.type);
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleOpenNotification(notification)}
                    className={`w-full rounded-2xl border p-3 text-right transition-colors ${
                      notification.isRead
                        ? "border-slate-200 bg-white hover:bg-slate-50"
                        : "border-[#F2B705]/30 bg-[#F2B705]/10 hover:bg-[#F2B705]/15"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-full p-2 ${
                          notification.isRead
                            ? "bg-slate-100 text-slate-600"
                            : "bg-white text-[#8b6700]"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-950">
                            {notification.title}
                          </span>
                          <Badge variant="outline" className="rounded-full shadow-none">
                            {notification.typeLabel}
                          </Badge>
                          {!notification.isRead ? (
                            <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                              جديد
                            </Badge>
                          ) : null}
                        </div>

                        <p className="text-sm leading-6 text-slate-600">
                          {notification.bodyText || "لا يوجد وصف إضافي لهذا التنبيه."}
                        </p>

                        <div className="text-xs text-slate-500">
                          {formatDistanceToNow(
                            notification.createdAtDate || new Date(),
                            {
                              addSuffix: true,
                              locale: ar,
                            }
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              لا توجد تنبيهات داخلية حاليًا.
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
