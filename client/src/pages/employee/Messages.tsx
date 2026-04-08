import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { CheckCircle2, Clock3, Inbox, Mail } from "lucide-react";
import { toast } from "sonner";
import { useSearch } from "wouter";

import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import EmployeeLayout from "@/components/EmployeeLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  groupEmployeeMessageConversations,
  normalizeEmployeeMessageRecord,
  type EmployeeMessageConversationRecord,
  type EmployeeMessageRecord,
} from "@/lib/employeeMessages";
import {
  EMPLOYEE_EMPTY_VALUE,
  normalizeEmployeeProfile,
  type EmployeeProfileUserDoc,
} from "@/lib/employeeProfile";
import { formatDateTimeEN } from "@/lib/formatters";
import { createInAppNotification } from "@/lib/inAppNotifications";
import { cn } from "@/lib/utils";
import {
  EMPLOYEE_MESSAGES_COLLECTION,
  type EmployeeMessageDoc,
} from "@shared/employee";

function initialsFromName(name: string, email?: string | null) {
  const source = String(name || email || "").trim();
  if (!source) return "م";

  const parts = source
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return source.slice(0, 2).toUpperCase();
  }

  return parts
    .map(part => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type MessageSenderProfile = {
  avatarUrl: string | null;
  name: string;
  email: string | null;
};

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
      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function resolveConversationCounterparty(
  conversation: EmployeeMessageConversationRecord | null,
  viewerUid: string | null | undefined
) {
  const latestMessage = conversation?.latestMessage;
  if (!latestMessage || !viewerUid) {
    return { uid: "", name: "HR" };
  }

  if (latestMessage.fromUserId === viewerUid) {
    return {
      uid: latestMessage.toUserId || latestMessage.recipientUid || "",
      name: latestMessage.toUserName || "HR",
    };
  }

  return {
    uid: latestMessage.fromUserId || latestMessage.senderUid || "",
    name: latestMessage.fromUserName || "HR",
  };
}

export default function EmployeeMessagesPage() {
  const { user } = useAuth();
  const search = useSearch();
  const [messages, setMessages] = useState<EmployeeMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [openingConversationId, setOpeningConversationId] = useState<
    string | null
  >(null);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [messageSenderLookup, setMessageSenderLookup] = useState<
    Record<string, MessageSenderProfile>
  >({});
  const handledMessageSearchRef = useRef("");

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
        const rows = snapshot.docs.map(docSnapshot =>
          normalizeEmployeeMessageRecord(
            docSnapshot.id,
            (docSnapshot.data() as Record<string, any>) || {}
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

  const conversations = useMemo(
    () => groupEmployeeMessageConversations(messages, user?.uid),
    [messages, user?.uid]
  );

  const requestedConversationId = useMemo(
    () =>
      messages.find(message => message.id === requestedMessageId)
        ?.conversationId || null,
    [messages, requestedMessageId]
  );

  useEffect(() => {
    if (
      requestedConversationId &&
      search &&
      handledMessageSearchRef.current !== search
    ) {
      handledMessageSearchRef.current = search;
      setActiveConversationId(requestedConversationId);
      return;
    }

    if (!requestedMessageId) {
      handledMessageSearchRef.current = "";
    }

    if (
      activeConversationId &&
      !conversations.some(
        conversation => conversation.id === activeConversationId
      )
    ) {
      setActiveConversationId(null);
    }
  }, [
    activeConversationId,
    conversations,
    requestedConversationId,
    requestedMessageId,
    search,
  ]);

  const activeConversation = useMemo(
    () =>
      conversations.find(
        conversation => conversation.id === activeConversationId
      ) || null,
    [activeConversationId, conversations]
  );
  const unreadMessagesCount = useMemo(
    () =>
      messages.filter(
        message => message.toUserId === user?.uid && !message.isRead
      ).length,
    [messages, user?.uid]
  );
  const readMessagesCount = messages.length - unreadMessagesCount;
  const conversationCounterparty = useMemo(
    () => resolveConversationCounterparty(activeConversation, user?.uid),
    [activeConversation, user?.uid]
  );
  const currentUserAvatarUrl = useMemo(() => {
    const currentUser = user as {
      photoURL?: string | null;
      avatarUrl?: string | null;
      firebaseUser?: { photoURL?: string | null } | null;
    } | null;

    return (
      currentUser?.avatarUrl ||
      currentUser?.photoURL ||
      currentUser?.firebaseUser?.photoURL ||
      null
    );
  }, [user]);

  useEffect(() => {
    const senderIds = Array.from(
      new Set(
        (activeConversation?.messages || [])
          .map(message => message.fromUserId || message.senderUid)
          .filter(Boolean)
      )
    );

    if (!senderIds.length) {
      setMessageSenderLookup({});
      return;
    }

    let cancelled = false;

    const loadSenderProfiles = async () => {
      const entries = await Promise.all(
        senderIds.map(async senderUid => {
          const seededMessage = activeConversation?.messages.find(
            message => (message.fromUserId || message.senderUid) === senderUid
          );

          if (!seededMessage) return null;

          if (senderUid === user?.uid) {
            return [
              senderUid,
              {
                avatarUrl:
                  currentUserAvatarUrl || seededMessage.fromUserPhoto || null,
                name:
                  seededMessage.fromUserName ||
                  user?.displayName ||
                  user?.email ||
                  "أنت",
                email: seededMessage.fromUserEmail || user?.email || null,
              },
            ] as const;
          }

          try {
            const snapshot = await getDoc(doc(db, "users", senderUid));
            if (snapshot.exists()) {
              const raw = {
                ...(snapshot.data() as EmployeeProfileUserDoc),
                uid: senderUid,
              } satisfies EmployeeProfileUserDoc;
              const profile = normalizeEmployeeProfile(raw, {
                displayName: raw.displayName,
                email: raw.email,
                photoURL: raw.photoURL,
              });

              return [
                senderUid,
                {
                  avatarUrl:
                    profile.personal.avatarUrl ||
                    seededMessage.fromUserPhoto ||
                    null,
                  name:
                    profile.personal.name !== EMPLOYEE_EMPTY_VALUE
                      ? profile.personal.name
                      : seededMessage.fromUserName || "HR",
                  email:
                    profile.personal.email !== EMPLOYEE_EMPTY_VALUE
                      ? profile.personal.email
                      : seededMessage.fromUserEmail || null,
                },
              ] as const;
            }
          } catch (error) {
            console.error("employee_message_sender_lookup_failed", {
              senderUid,
              error,
            });
          }

          return [
            senderUid,
            {
              avatarUrl: seededMessage.fromUserPhoto || null,
              name: seededMessage.fromUserName || "HR",
              email: seededMessage.fromUserEmail || null,
            },
          ] as const;
        })
      );

      if (cancelled) return;

      setMessageSenderLookup(
        Object.fromEntries(
          entries.filter(
            (entry): entry is readonly [string, MessageSenderProfile] =>
              Boolean(entry)
          )
        )
      );
    };

    void loadSenderProfiles();

    return () => {
      cancelled = true;
    };
  }, [
    activeConversation,
    currentUserAvatarUrl,
    user?.displayName,
    user?.email,
    user?.uid,
  ]);

  const markConversationAsRead = async (
    conversation: EmployeeMessageConversationRecord
  ) => {
    if (!user?.uid) return;

    const unreadIncomingMessages = conversation.messages.filter(
      message => message.toUserId === user.uid && !message.isRead
    );
    if (!unreadIncomingMessages.length) return;

    setOpeningConversationId(conversation.id);
    try {
      const batch = writeBatch(db);
      unreadIncomingMessages.forEach(message => {
        batch.update(doc(db, EMPLOYEE_MESSAGES_COLLECTION, message.id), {
          isRead: true,
          readAt: serverTimestamp(),
          status: "read",
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (error) {
      console.error("employee_message_mark_read_failed", error);
    } finally {
      setOpeningConversationId(current =>
        current === conversation.id ? null : current
      );
    }
  };

  const handleOpenConversation = async (
    conversation: EmployeeMessageConversationRecord
  ) => {
    if (activeConversationId === conversation.id) {
      setActiveConversationId(null);
      return;
    }

    setActiveConversationId(conversation.id);
    await markConversationAsRead(conversation);
  };

  const handleCloseConversation = () => {
    setActiveConversationId(null);
  };

  useEffect(() => {
    if (!activeConversation) return;
    void markConversationAsRead(activeConversation);
  }, [activeConversation, user?.uid]);

  const handleSendReply = async () => {
    if (!user?.uid || !activeConversation) return;

    const normalizedReply = replyBody.trim();
    if (!normalizedReply) {
      toast.error("اكتب الرد أولًا.");
      return;
    }

    const replyTargetUid = conversationCounterparty.uid;
    if (!replyTargetUid) {
      toast.error("تعذر تحديد الجهة المستلمة لهذا الرد.");
      return;
    }

    const parentMessage =
      activeConversation.messages[activeConversation.messages.length - 1];
    if (!parentMessage) {
      toast.error("تعذر ربط الرد بالمحادثة الحالية.");
      return;
    }

    setSendingReply(true);
    try {
      const messageRef = doc(collection(db, EMPLOYEE_MESSAGES_COLLECTION));
      const senderDisplayName = user.displayName || user.email || "الموظف";
      const replyTargetName = conversationCounterparty.name || "HR";
      const replyTargetMessage = [...activeConversation.messages]
        .reverse()
        .find(
          message =>
            (message.fromUserId || message.senderUid) === replyTargetUid ||
            (message.toUserId || message.recipientUid) === replyTargetUid
        );
      const replyTargetEmail =
        replyTargetMessage?.fromUserId === replyTargetUid
          ? replyTargetMessage.fromUserEmail || null
          : replyTargetMessage?.toUserEmail || null;
      const replyTargetPhoto =
        replyTargetMessage?.fromUserId === replyTargetUid
          ? replyTargetMessage.fromUserPhoto || null
          : replyTargetMessage?.toUserPhoto || null;

      await setDoc(messageRef, {
        employeeId: activeConversation.employeeId || null,
        employeeUid: activeConversation.employeeUid,
        conversationId: activeConversation.conversationId,
        threadId:
          activeConversation.threadId || activeConversation.conversationId,
        senderUid: user.uid,
        senderRole: "employee",
        recipientUid: replyTargetUid,
        messageType: "message",
        body: normalizedReply,
        status: "sent",
        fromUserId: user.uid,
        fromUserName: senderDisplayName,
        fromUserEmail: user.email || null,
        fromUserPhoto: currentUserAvatarUrl || null,
        toUserId: replyTargetUid,
        toUserName: replyTargetName,
        toUserEmail: replyTargetEmail,
        toUserPhoto: replyTargetPhoto,
        message: normalizedReply,
        type: "message",
        relatedTo: "employee_message",
        relatedId: parentMessage.id,
        createdAt: serverTimestamp(),
        isRead: false,
        readAt: null,
        updatedAt: serverTimestamp(),
      } satisfies EmployeeMessageDoc);

      let notificationFailed = false;
      try {
        const relatedPath = activeConversation.employeeId
          ? `/admin/employees?employeeId=${encodeURIComponent(
              activeConversation.employeeId
            )}&panel=messages&messageId=${messageRef.id}`
          : `/admin/employees?panel=messages&messageId=${messageRef.id}`;

        await createInAppNotification({
          userId: replyTargetUid,
          title: "رد جديد من الموظف",
          body: normalizedReply,
          type: "message",
          relatedId: messageRef.id,
          relatedTo: "employee_message",
          relatedPath,
        });
      } catch (notificationError) {
        notificationFailed = true;
        console.error("employee_reply_notification_failed", notificationError);
      }

      setReplyBody("");
      setActiveConversationId(activeConversation.id);
      toast.success(
        notificationFailed
          ? "تم إرسال الرد لكن تعذر إنشاء التنبيه الداخلي."
          : "تم إرسال الرد داخل نفس المحادثة."
      );
    } catch (error) {
      console.error("employee_reply_send_failed", error);
      toast.error("تعذر إرسال الرد الآن.");
    } finally {
      setSendingReply(false);
    }
  };

  if (!user) return null;

  return (
    <EmployeeLayout
      title="رسائلي الداخلية"
      description="هنا تظهر رسائل HR والتنبيهات النصية المرتبطة بملفك الوظيفي. افتح أي محادثة لعرض السجل كاملًا والرد داخل نفس المسار."
    >
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <MessagesStat
            label="إجمالي الرسائل"
            value={String(messages.length)}
          />
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
              سجل المحادثات
            </CardTitle>
            <CardDescription className="text-sm leading-7 text-slate-600">
              القائمة تعرض آخر محادثة أولًا، وداخل كل محادثة تظهر الرسائل بترتيب
              زمني ثابت من الأقدم إلى الأحدث.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                جارٍ تحميل الرسائل...
              </div>
            ) : conversations.length ? (
              <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                <div
                  dir="rtl"
                  className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-3"
                >
                  <ScrollArea className="h-[520px]">
                    <div className="space-y-2">
                      {conversations.map(conversation => {
                        const latestMessage = conversation.latestMessage;
                        const isActive =
                          conversation.id === activeConversationId;
                        const incomingLatest =
                          latestMessage.toUserId === user.uid;
                        const counterpartLabel =
                          latestMessage.fromUserId === user.uid
                            ? latestMessage.toUserName || "HR"
                            : latestMessage.fromUserName || "HR";

                        return (
                          <button
                            key={conversation.id}
                            type="button"
                            onClick={() =>
                              void handleOpenConversation(conversation)
                            }
                            className={cn(
                              "w-full min-w-0 rounded-[22px] border px-4 py-4 text-right transition-all",
                              isActive
                                ? "border-slate-900 bg-slate-900 text-white shadow-[0_20px_42px_-28px_rgba(15,23,42,0.75)]"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-full shadow-none",
                                      isActive
                                        ? "border-white/20 bg-white/10 text-white"
                                        : "border-slate-200 bg-slate-50 text-slate-600"
                                    )}
                                  >
                                    {latestMessage.typeLabel}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-full shadow-none",
                                      isActive
                                        ? "border-white/20 bg-white/10 text-white"
                                        : incomingLatest
                                          ? "border-amber-200 bg-amber-50 text-amber-700"
                                          : "border-slate-200 bg-slate-100 text-slate-600"
                                    )}
                                  >
                                    {incomingLatest ? "HR" : "أنت"}
                                  </Badge>
                                  {conversation.unreadCount > 0 ? (
                                    <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                                      {conversation.unreadCount} جديد
                                    </Badge>
                                  ) : null}
                                </div>

                                <div className="mt-3 min-w-0 text-sm font-semibold">
                                  {counterpartLabel}
                                </div>
                                <div
                                  className={cn(
                                    "mt-2 min-w-0 text-right text-sm leading-7 line-clamp-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                                    isActive
                                      ? "text-white/80"
                                      : "text-slate-600"
                                  )}
                                >
                                  {latestMessage.preview ||
                                    "لا يوجد نص محفوظ لهذه الرسالة."}
                                </div>
                              </div>

                              <div
                                className={cn(
                                  "shrink-0 whitespace-nowrap pt-0.5 text-[11px]",
                                  isActive ? "text-white/70" : "text-slate-500"
                                )}
                              >
                                {latestMessage.createdAtDate
                                  ? formatDateTimeEN(
                                      latestMessage.createdAtDate
                                    )
                                  : "تاريخ غير متوفر"}
                              </div>
                            </div>

                            <div
                              className={cn(
                                "mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs",
                                isActive
                                  ? "border-white/10 text-white/70"
                                  : "border-slate-200 text-slate-500"
                              )}
                            >
                              <span>
                                {conversation.messages.length} رسالة داخل السجل
                              </span>
                              <span>
                                {incomingLatest
                                  ? "آخر رسالة واردة من HR"
                                  : "آخر رسالة منك"}
                              </span>
                            </div>
                            {openingConversationId === conversation.id ? (
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

                <div className="space-y-4" dir="rtl">
                  <div className="space-y-5 text-right">
                    {activeConversation ? (
                      <div className="space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                            >
                              {activeConversation.latestMessage.typeLabel}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="rounded-full border-slate-200 bg-white text-slate-600 shadow-none"
                            >
                              المحادثة مع{" "}
                              {conversationCounterparty.name || "HR"}
                            </Badge>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCloseConversation}
                          >
                            إغلاق
                          </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                              السجل
                            </div>
                            <div className="mt-2 text-sm font-semibold text-slate-950">
                              {activeConversation.messages.length} رسالة داخل
                              نفس المحادثة
                            </div>
                          </div>
                          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                              آخر تحديث
                            </div>
                            <div className="mt-2 text-sm font-semibold text-slate-950">
                              {activeConversation.latestMessage.createdAtDate
                                ? formatDateTimeEN(
                                    activeConversation.latestMessage
                                      .createdAtDate
                                  )
                                : "غير متوفر"}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 pt-1">
                          {activeConversation.messages.map(message => {
                            const ownMessage = message.fromUserId === user.uid;
                            const senderId =
                              message.fromUserId || message.senderUid || "";
                            const senderProfile = senderId
                              ? messageSenderLookup[senderId]
                              : null;
                            const senderName =
                              senderProfile?.name ||
                              message.fromUserName ||
                              (ownMessage
                                ? user?.displayName || user?.email || "أنت"
                                : "HR");
                            const senderEmail =
                              senderProfile?.email ||
                              message.fromUserEmail ||
                              (ownMessage ? user?.email || null : null);
                            const avatarUrl =
                              senderProfile?.avatarUrl ||
                              message.fromUserPhoto ||
                              (ownMessage ? currentUserAvatarUrl : null);
                            const avatarNode = (
                              <Avatar className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-slate-100 shadow-sm">
                                <AvatarImage
                                  src={avatarUrl || undefined}
                                  alt={senderName}
                                  className="object-cover"
                                />
                                <AvatarFallback className="bg-slate-900 text-[11px] font-semibold text-white">
                                  {initialsFromName(senderName, senderEmail)}
                                </AvatarFallback>
                              </Avatar>
                            );

                            return (
                              <div
                                key={message.id}
                                className={cn(
                                  "flex items-start gap-3",
                                  ownMessage ? "justify-end" : "justify-start"
                                )}
                                dir="ltr"
                              >
                                {ownMessage ? (
                                  <>
                                    <div
                                      className={cn(
                                        "max-w-[70%] rounded-2xl border px-4 py-3 text-right shadow-[0_18px_40px_-32px_rgba(15,23,42,0.32)]",
                                        "border-slate-200 bg-white text-slate-800"
                                      )}
                                      dir="rtl"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge
                                          variant="outline"
                                          className="rounded-full border-slate-200 bg-slate-50 text-slate-700 shadow-none"
                                        >
                                          أنت
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="rounded-full border-slate-200 bg-white text-slate-500 shadow-none"
                                        >
                                          رسالة موظف
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="rounded-full border-slate-200 bg-white text-slate-500 shadow-none"
                                        >
                                          {message.typeLabel}
                                        </Badge>
                                      </div>

                                      <div className="mt-3 whitespace-pre-wrap break-words text-[0.97rem] leading-8 text-slate-800 [overflow-wrap:anywhere]">
                                        {message.body ||
                                          "لا يوجد نص محفوظ لهذه الرسالة."}
                                      </div>

                                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-xs text-slate-500">
                                        <span>
                                          {message.createdAtDate
                                            ? formatDateTimeEN(
                                                message.createdAtDate
                                              )
                                            : "تاريخ غير متوفر"}
                                        </span>
                                        <span>
                                          {message.isRead && message.readAtDate
                                            ? `تمت القراءة في ${formatDateTimeEN(
                                                message.readAtDate
                                              )}`
                                            : "بانتظار القراءة"}
                                        </span>
                                      </div>
                                    </div>
                                    {avatarNode}
                                  </>
                                ) : (
                                  <>
                                    {avatarNode}
                                    <div
                                      className={cn(
                                        "max-w-[70%] rounded-2xl border px-4 py-3 text-right shadow-[0_18px_40px_-32px_rgba(15,23,42,0.32)]",
                                        "border-[#E7D8AA] bg-[#FBF7E8] text-slate-900"
                                      )}
                                      dir="rtl"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge
                                          variant="outline"
                                          className="rounded-full border-[#E7D8AA] bg-white text-[#8b6700] shadow-none"
                                        >
                                          {senderName}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="rounded-full border-[#E7D8AA] bg-[#F8F2DD] text-[#8b6700] shadow-none"
                                        >
                                          رسالة HR
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="rounded-full border-slate-200 bg-white text-slate-500 shadow-none"
                                        >
                                          {message.typeLabel}
                                        </Badge>
                                      </div>

                                      <div className="mt-3 whitespace-pre-wrap break-words text-[0.97rem] leading-8 text-slate-800 [overflow-wrap:anywhere]">
                                        {message.body ||
                                          "لا يوجد نص محفوظ لهذه الرسالة."}
                                      </div>

                                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-xs text-slate-500">
                                        <span>
                                          {message.createdAtDate
                                            ? formatDateTimeEN(
                                                message.createdAtDate
                                              )
                                            : "تاريخ غير متوفر"}
                                        </span>
                                        <span>وارد من HR</span>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
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
                          <EmptyTitle>اختر محادثة من القائمة</EmptyTitle>
                          <EmptyDescription>
                            ستظهر تفاصيل السجل هنا بمجرد اختيار المحادثة من
                            القائمة الجانبية.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </div>

                  <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5">
                    <div className="mb-4 space-y-1">
                      <div className="text-sm font-semibold text-slate-900">
                        الرد داخل نفس المحادثة
                      </div>
                      <p className="text-sm leading-6 text-slate-500">
                        سيصل الرد إلى HR داخل نفس السجل، ويظهر مباشرة في
                        المحادثة الحالية.
                      </p>
                    </div>

                    <Textarea
                      value={replyBody}
                      onChange={event => setReplyBody(event.target.value)}
                      placeholder={
                        activeConversation
                          ? "اكتب ردك هنا"
                          : "اختر محادثة أولًا حتى تتمكن من الرد"
                      }
                      className="min-h-36 resize-y bg-white text-right leading-7 [direction:rtl]"
                      disabled={!activeConversation || sendingReply}
                    />

                    <div className="mt-4 flex flex-wrap justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setReplyBody("")}
                        disabled={sendingReply || !replyBody.trim()}
                      >
                        إعادة ضبط
                      </Button>
                      <Button
                        type="button"
                        className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                        onClick={() => void handleSendReply()}
                        disabled={!activeConversation || sendingReply}
                      >
                        <Mail className="ml-2 h-4 w-4" />
                        {sendingReply ? "جارٍ الإرسال..." : "إرسال الرد"}
                      </Button>
                    </div>
                  </div>
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
            عند فتح أي محادثة يتم تحديث الرسائل الواردة لك كمقروءة، وعند إرسال
            رد جديد يظهر مباشرة في نفس السجل ويُعاد ضبط خانة الكتابة تلقائيًا
            بعد نجاح الإرسال.
          </p>
        </div>
      </section>
    </EmployeeLayout>
  );
}
