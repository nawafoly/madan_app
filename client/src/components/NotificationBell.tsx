// client/src/components/NotificationBell.tsx
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";

type FsNotification = {
  id: string;
  title: string;
  message: string;
  type?: string;
  isRead?: boolean;
  targetUid: string;
  createdAt?: Timestamp | Date | null;
};

function toJsDate(v: any): Date {
  if (!v) return new Date();
  // Firestore Timestamp
  if (typeof v?.toDate === "function") return v.toDate();
  // Date
  if (v instanceof Date) return v;
  // string/number fallback
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<FsNotification[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("targetUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: FsNotification[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title ?? "",
            message: data.message ?? "",
            type: data.type ?? "general",
            isRead: Boolean(data.isRead),
            targetUid: data.targetUid,
            createdAt: data.createdAt ?? null,
          };
        });
        setItems(rows);
      },
      () => {
        // لو rules منعت القراءة، نخليها فاضية بدون كسر UI
        setItems([]);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.isRead).length,
    [items]
  );

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { isRead: true });
    } catch {
      // ignore to avoid UI crash
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!items.length) return;
    try {
      const batch = writeBatch(db);
      items
        .filter((n) => !n.isRead)
        .forEach((n) => batch.update(doc(db, "notifications", n.id), { isRead: true }));
      await batch.commit();
    } catch {
      // ignore
    }
  };

  const getNotificationIcon = (type?: string) => {
    switch (type) {
      case "investment_approved":
        return "✅";
      case "investment_rejected":
        return "❌";
      case "project_update":
        return "📢";
      case "vip_offer":
        return "👑";
      default:
        return "🔔";
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80" align="end">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">الإشعارات</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="text-xs"
            >
              تحديد الكل كمقروء
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد إشعارات
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    !notification.isRead
                      ? "bg-primary/5 border-primary/20"
                      : "bg-background"
                  }`}
                  onClick={() => !notification.isRead && handleMarkAsRead(notification.id)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-2xl">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{notification.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(toJsDate(notification.createdAt), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
