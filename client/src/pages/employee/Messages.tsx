import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { CheckCircle2, Clock3, Inbox, Mail } from "lucide-react";
import { useSearch } from "wouter";

import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import EmployeeLayout from "@/components/EmployeeLayout";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  normalizeEmployeeMessageRecord,
  sortEmployeeMessages,
  type EmployeeMessageRecord,
} from "@/lib/employeeMessages";
import { formatDateTimeEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EMPLOYEE_MESSAGES_COLLECTION } from "@shared/employee";

function MessagesStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border px-5 py-4 shadow-sm",
        tone === "warning"
          ? "border-amber-200 bg-amber-50/80"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50/80"
            : "border-slate-200/80 bg-white/90"
      )}
    >
      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export default function EmployeeMessagesPage() {
  const { user } = useAuth();
  const search = useSearch();
  const [messages, setMessages] = useState<EmployeeMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [openingMessageId, setOpeningMessageId] = useState<string | null>(null);
  const [handledMessageSearch, setHandledMessageSearch] = useState("");
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const requestedMessageId = useMemo(
    () => String(searchParams.get("messageId") || "").trim(),
    [searchParams]
  );

  useEffect(() => {
    if (!user?.uid) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_MESSAGES_COLLECTION),
        where("employeeUid", "==", user.uid)
      ),
      snapshot => {
        const rows = sortEmployeeMessages(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeMessageRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setMessages(rows);
        setLoading(false);
      },
      error => {
        console.error("employee_messages_snapshot_error", error);
        setMessages([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!requestedMessageId) {
      setHandledMessageSearch("");
    }

    if (
      requestedMessageId &&
      search &&
      handledMessageSearch !== search &&
      messages.some(message => message.id === requestedMessageId)
    ) {
      setHandledMessageSearch(search);
      setActiveMessageId(requestedMessageId);
      return;
    }

    if (!activeMessageId && messages.length) {
      setActiveMessageId(messages[0].id);
      return;
    }

    if (activeMessageId && !messages.some(message => message.id === activeMessageId)) {
      setActiveMessageId(messages[0]?.id || null);
    }
  }, [activeMessageId, handledMessageSearch, messages, requestedMessageId, search]);

  const activeMessage = useMemo(
    () => messages.find(message => message.id === activeMessageId) || null,
    [activeMessageId, messages]
  );
  const unreadMessagesCount = useMemo(
    () =>
      messages.filter(
        message => message.toUserId === user?.uid && !message.isRead
      ).length,
    [messages, user?.uid]
  );
  const readMessagesCount = messages.length - unreadMessagesCount;

  const handleOpenMessage = async (message: EmployeeMessageRecord) => {
    setActiveMessageId(message.id);

    if (!user?.uid || message.toUserId !== user.uid || message.isRead) {
      return;
    }

    setOpeningMessageId(message.id);
    try {
      await updateDoc(doc(db, EMPLOYEE_MESSAGES_COLLECTION, message.id), {
        isRead: true,
        readAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("employee_message_mark_read_failed", error);
    } finally {
      setOpeningMessageId(current => (current === message.id ? null : current));
    }
  };

  useEffect(() => {
    if (!activeMessage || !user?.uid) return;
    if (activeMessage.toUserId !== user.uid || activeMessage.isRead) return;
    void handleOpenMessage(activeMessage);
  }, [activeMessage, user?.uid]);

  if (!user) return null;

  return (
    <EmployeeLayout
      title="رسائلي الداخلية"
      description="هنا تظهر رسائل HR والتنبيهات النصية المرتبطة بملفك الوظيفي. عند فتح الرسالة يتم تسجيلها كمقروءة داخل النظام."
    >
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <MessagesStat label="إجمالي الرسائل" value={String(messages.length)} />
          <MessagesStat
            label="رسائل غير مقروءة"
            value={String(unreadMessagesCount)}
            tone="warning"
          />
          <MessagesStat
            label="رسائل مقروءة"
            value={String(readMessagesCount)}
            tone="success"
          />
        </div>

        <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_28px_80px_-52px_rgba(15,23,42,0.28)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              <Mail className="h-4 w-4" />
              الرسائل الداخلية
            </div>
            <CardTitle className="text-xl font-semibold text-slate-950">
              صندوق الرسائل
            </CardTitle>
            <CardDescription className="text-sm leading-7 text-slate-600">
              الرسائل الأحدث تظهر أولًا. اختر أي رسالة من القائمة لقراءة محتواها وتحديث حالتها.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                جارٍ تحميل الرسائل...
              </div>
            ) : messages.length ? (
              <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-3">
                  <ScrollArea className="h-[420px]">
                    <div className="space-y-2">
                      {messages.map(message => {
                        const incoming = message.toUserId === user.uid;
                        const isActive = message.id === activeMessageId;

                        return (
                          <button
                            key={message.id}
                            type="button"
                            onClick={() => void handleOpenMessage(message)}
                            className={cn(
                              "w-full rounded-[20px] border p-4 text-right transition-colors",
                              isActive
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full shadow-none",
                                  isActive
                                    ? "border-white/20 bg-white/10 text-white"
                                    : "bg-slate-50"
                                )}
                              >
                                {message.typeLabel}
                              </Badge>
                              {!message.isRead && incoming ? (
                                <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                                  جديد
                                </Badge>
                              ) : null}
                            </div>

                            <div className="mt-3 text-sm font-semibold">
                              {incoming
                                ? message.fromUserName || "HR"
                                : message.toUserName || "الجهة المستلمة"}
                            </div>
                            <div
                              className={cn(
                                "mt-2 text-sm leading-6",
                                isActive ? "text-white/80" : "text-slate-600"
                              )}
                            >
                              {message.preview || "لا يوجد نص في هذه الرسالة."}
                            </div>
                            <div
                              className={cn(
                                "mt-3 text-xs",
                                isActive ? "text-white/70" : "text-slate-500"
                              )}
                            >
                              {message.createdAtDate
                                ? formatDateTimeEN(message.createdAtDate)
                                : "تاريخ غير متوفر"}
                            </div>
                            {openingMessageId === message.id ? (
                              <div
                                className={cn(
                                  "mt-2 text-xs",
                                  isActive ? "text-white/70" : "text-slate-500"
                                )}
                              >
                                جارٍ تحديث حالة القراءة...
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5">
                  {activeMessage ? (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                        >
                          {activeMessage.typeLabel}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full shadow-none",
                            activeMessage.isRead
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          )}
                        >
                          {activeMessage.isRead ? "مقروءة" : "غير مقروءة"}
                        </Badge>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            من
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-950">
                            {activeMessage.fromUserName || "HR"}
                          </div>
                        </div>
                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                          <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                            تاريخ الرسالة
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-950">
                            {activeMessage.createdAtDate
                              ? formatDateTimeEN(activeMessage.createdAtDate)
                              : "غير متوفر"}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-white px-5 py-5 text-sm leading-8 text-slate-700">
                        {activeMessage.message || "لا يوجد نص محفوظ لهذه الرسالة."}
                      </div>

                      <div className="rounded-[20px] border border-slate-200/80 bg-white/85 px-4 py-3 text-sm text-slate-600">
                        الرد المباشر داخل هذه الصفحة غير مفعّل في هذه المرحلة. يمكنك متابعة الرسائل الواردة والتنبيهات المرتبطة بها فقط.
                      </div>
                    </div>
                  ) : (
                    <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-white/90">
                      <EmptyHeader>
                        <EmptyMedia
                          variant="icon"
                          className="bg-[#F2B705]/12 text-[#030640]"
                        >
                          <Inbox className="size-5" />
                        </EmptyMedia>
                        <EmptyTitle>اختر رسالة من القائمة</EmptyTitle>
                        <EmptyDescription>
                          ستظهر تفاصيل الرسالة هنا بمجرد اختيارها من القائمة الجانبية.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>
              </div>
            ) : (
              <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                <EmptyHeader>
                  <EmptyMedia
                    variant="icon"
                    className="bg-[#F2B705]/12 text-[#030640]"
                  >
                    <Inbox className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>لا توجد رسائل داخلية حاليًا</EmptyTitle>
                  <EmptyDescription>
                    عندما يرسل لك HR رسالة أو تنبيهًا نصيًا سيظهر هنا مباشرة.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 text-sm leading-7 text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            {unreadMessagesCount > 0 ? (
              <Clock3 className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            حالة الرسائل
          </div>
          <p className="mt-3">
            الرسائل غير المفتوحة تظهر كغير مقروءة، وعند اختيار الرسالة من القائمة يتم تسجيل وقت قراءتها داخل النظام.
          </p>
        </div>
      </section>
    </EmployeeLayout>
  );
}
