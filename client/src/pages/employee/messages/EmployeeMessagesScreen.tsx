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
import {
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquare,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useSearch } from "wouter";

import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import EmployeeLayout from "@/components/EmployeeLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchActiveEmployeeCoworkers, type EmployeeCoworkerOption } from "@/lib/employeeCoworkers";
import {
  buildEmployeeMessageParticipants,
  buildEmployeePeerConversationId,
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
import { createInAppNotification } from "@/lib/inAppNotifications";
import {
  ConversationWorkspace,
  MessagesStat,
  RecipientPicker,
  type MessageSenderProfile,
} from "@/pages/employee/messages/ConversationUi";
import {
  EMPLOYEE_MESSAGES_COLLECTION,
  type EmployeeMessageDoc,
} from "@shared/employee";

type ConversationSectionKey = "hr" | "internal";

function mergeMessageCollections(collections: EmployeeMessageRecord[][]) {
  const byId = new Map<string, EmployeeMessageRecord>();
  collections.flat().forEach(message => {
    byId.set(message.id, message);
  });
  return Array.from(byId.values());
}

function buildRecipientFromConversation(
  conversation: EmployeeMessageConversationRecord | null
) {
  if (!conversation?.counterpartyUid) return null;
  return {
    uid: conversation.counterpartyUid,
    name: conversation.counterpartyName || "موظف",
    email: conversation.counterpartyEmail,
    avatarUrl: conversation.counterpartyPhoto,
    title: null,
    department: null,
    statusKey: "active",
  } satisfies EmployeeCoworkerOption;
}

export default function EmployeeMessagesScreen() {
  const { user } = useAuth();
  const search = useSearch();

  const [legacyMessages, setLegacyMessages] = useState<EmployeeMessageRecord[]>([]);
  const [participantMessages, setParticipantMessages] = useState<EmployeeMessageRecord[]>([]);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [participantLoading, setParticipantLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<ConversationSectionKey>("hr");
  const [activeHrConversationId, setActiveHrConversationId] = useState<string | null>(null);
  const [activeInternalConversationId, setActiveInternalConversationId] = useState<string | null>(null);
  const [openingConversationId, setOpeningConversationId] = useState<string | null>(null);
  const [hrReplyBody, setHrReplyBody] = useState("");
  const [internalMessageBody, setInternalMessageBody] = useState("");
  const [sendingHrReply, setSendingHrReply] = useState(false);
  const [sendingInternalMessage, setSendingInternalMessage] = useState(false);
  const [messageSenderLookup, setMessageSenderLookup] = useState<Record<string, MessageSenderProfile>>({});
  const [coworkers, setCoworkers] = useState<EmployeeCoworkerOption[]>([]);
  const [coworkersLoading, setCoworkersLoading] = useState(true);
  const [coworkersError, setCoworkersError] = useState("");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [selectedInternalRecipientUid, setSelectedInternalRecipientUid] = useState("");
  const handledMessageSearchRef = useRef("");

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const requestedMessageId = useMemo(
    () => String(searchParams.get("messageId") || "").trim(),
    [searchParams]
  );

  useEffect(() => {
    if (!user?.uid) {
      setLegacyMessages([]);
      setParticipantMessages([]);
      setLegacyLoading(false);
      setParticipantLoading(false);
      return;
    }

    setLegacyLoading(true);
    setParticipantLoading(true);

    const unsubscribeLegacy = onSnapshot(
      query(collection(db, EMPLOYEE_MESSAGES_COLLECTION), where("employeeUid", "==", user.uid)),
      snapshot => {
        setLegacyMessages(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeMessageRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setLegacyLoading(false);
      },
      error => {
        console.error("employee_messages_legacy_snapshot_error", error);
        setLegacyMessages([]);
        setLegacyLoading(false);
      }
    );

    const unsubscribeParticipants = onSnapshot(
      query(collection(db, EMPLOYEE_MESSAGES_COLLECTION), where("participantUids", "array-contains", user.uid)),
      snapshot => {
        setParticipantMessages(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeMessageRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setParticipantLoading(false);
      },
      error => {
        console.error("employee_messages_participants_snapshot_error", error);
        setParticipantMessages([]);
        setParticipantLoading(false);
      }
    );

    return () => {
      unsubscribeLegacy();
      unsubscribeParticipants();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setCoworkers([]);
      setCoworkersLoading(false);
      setCoworkersError("");
      return;
    }

    let cancelled = false;
    setCoworkersLoading(true);
    setCoworkersError("");

    void fetchActiveEmployeeCoworkers()
      .then(rows => {
        if (cancelled) return;
        setCoworkers(
          rows
            .filter(row => row.uid !== user.uid)
            .sort((left, right) =>
              left.name.localeCompare(right.name, "ar", { sensitivity: "base" })
            )
        );
        setCoworkersLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        console.error("employee_coworkers_fetch_failed", error);
        setCoworkers([]);
        setCoworkersLoading(false);
        setCoworkersError("تعذر تحميل قائمة الموظفين النشطين الآن.");
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const loading = legacyLoading || participantLoading;
  const messages = useMemo(
    () => mergeMessageCollections([legacyMessages, participantMessages]),
    [legacyMessages, participantMessages]
  );
  const conversations = useMemo(
    () => groupEmployeeMessageConversations(messages, user?.uid),
    [messages, user?.uid]
  );
  const hrConversations = useMemo(
    () => conversations.filter(conversation => conversation.conversationType !== "employee_to_employee"),
    [conversations]
  );
  const internalConversations = useMemo(
    () => conversations.filter(conversation => conversation.conversationType === "employee_to_employee"),
    [conversations]
  );
  const requestedConversationId = useMemo(
    () => messages.find(message => message.id === requestedMessageId)?.conversationId || null,
    [messages, requestedMessageId]
  );

  useEffect(() => {
    if (requestedConversationId && search && handledMessageSearchRef.current !== search) {
      const targetConversation = conversations.find(conversation => conversation.id === requestedConversationId) || null;
      if (!targetConversation) return;
      handledMessageSearchRef.current = search;

      if (targetConversation.conversationType === "employee_to_employee") {
        setActiveSection("internal");
        setActiveInternalConversationId(targetConversation.id);
        setSelectedInternalRecipientUid(targetConversation.counterpartyUid);
      } else {
        setActiveSection("hr");
        setActiveHrConversationId(targetConversation.id);
      }
      return;
    }

    if (!requestedMessageId) {
      handledMessageSearchRef.current = "";
    }
  }, [conversations, requestedConversationId, requestedMessageId, search]);

  useEffect(() => {
    if (activeSection === "hr" && !hrConversations.length && internalConversations.length) {
      setActiveSection("internal");
    }
  }, [activeSection, hrConversations.length, internalConversations.length]);

  const activeHrConversation = useMemo(
    () => hrConversations.find(conversation => conversation.id === activeHrConversationId) || null,
    [activeHrConversationId, hrConversations]
  );
  const activeInternalConversation = useMemo(
    () => internalConversations.find(conversation => conversation.id === activeInternalConversationId) || null,
    [activeInternalConversationId, internalConversations]
  );
  const activeConversation = activeSection === "internal" ? activeInternalConversation : activeHrConversation;
  const coworkersByUid = useMemo(
    () => new Map(coworkers.map(coworker => [coworker.uid, coworker])),
    [coworkers]
  );
  const currentUserDisplayName = useMemo(
    () => user?.displayName || user?.email || "أنت",
    [user?.displayName, user?.email]
  );
  const currentUserAvatarUrl = useMemo(() => {
    const currentUser = user as {
      photoURL?: string | null;
      avatarUrl?: string | null;
      firebaseUser?: { photoURL?: string | null } | null;
    } | null;
    return currentUser?.avatarUrl || currentUser?.photoURL || currentUser?.firebaseUser?.photoURL || null;
  }, [user]);
  const selectedInternalRecipient = useMemo(() => {
    if (activeInternalConversation) {
      return coworkersByUid.get(activeInternalConversation.counterpartyUid) || buildRecipientFromConversation(activeInternalConversation);
    }
    return selectedInternalRecipientUid ? coworkersByUid.get(selectedInternalRecipientUid) || null : null;
  }, [activeInternalConversation, coworkersByUid, selectedInternalRecipientUid]);
  const internalEmptyConversationContent = useMemo(() => {
    if (!selectedInternalRecipient) return null;

    return (
      <div className="min-h-[320px] rounded-[24px] border border-sky-100 bg-sky-50/40 p-6 text-right">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-full border-sky-200 bg-white text-sky-700 shadow-none">
            محادثة داخلية جديدة
          </Badge>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600 shadow-none">
            لم تبدأ الرسائل بعد
          </Badge>
        </div>

        <div className="mt-5 space-y-2">
          <div className="text-lg font-semibold text-slate-950">
            {selectedInternalRecipient.name}
          </div>
          <p className="text-sm leading-7 text-slate-600">
            تم اختيار هذا الموظف كمستلم. اكتب الرسالة الأولى بالأسفل وسيتم إنشاء
            المحادثة مباشرة داخل السجل الداخلي.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
              المستلم
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {selectedInternalRecipient.name}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
              البريد
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {selectedInternalRecipient.email || "غير متوفر"}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
              القسم / المسمى
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {[selectedInternalRecipient.title, selectedInternalRecipient.department]
                .filter(Boolean)
                .join(" - ") || "غير متوفر"}
            </div>
          </div>
        </div>
      </div>
    );
  }, [selectedInternalRecipient]);

  useEffect(() => {
    if (activeInternalConversation?.counterpartyUid) {
      setSelectedInternalRecipientUid(activeInternalConversation.counterpartyUid);
    }
  }, [activeInternalConversation?.counterpartyUid]);

  useEffect(() => {
    const senderIds = Array.from(new Set((activeConversation?.messages || []).map(message => message.fromUserId || message.senderUid).filter(Boolean)));
    if (!senderIds.length) {
      setMessageSenderLookup({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      senderIds.map(async senderUid => {
        const seededMessage = activeConversation?.messages.find(message => (message.fromUserId || message.senderUid) === senderUid);
        if (!seededMessage) return null;
        if (senderUid === user?.uid) {
          return [senderUid, { avatarUrl: currentUserAvatarUrl || seededMessage.fromUserPhoto || null, name: seededMessage.fromUserName || currentUserDisplayName, email: seededMessage.fromUserEmail || user?.email || null }] as const;
        }

        const coworker = coworkersByUid.get(senderUid);
        if (coworker) {
          return [senderUid, { avatarUrl: coworker.avatarUrl || seededMessage.fromUserPhoto || null, name: coworker.name, email: coworker.email || seededMessage.fromUserEmail || null }] as const;
        }

        try {
          const snapshot = await getDoc(doc(db, "users", senderUid));
          if (snapshot.exists()) {
            const raw = { ...(snapshot.data() as EmployeeProfileUserDoc), uid: senderUid } satisfies EmployeeProfileUserDoc;
            const profile = normalizeEmployeeProfile(raw, { displayName: raw.displayName, email: raw.email, photoURL: raw.photoURL });
            return [senderUid, { avatarUrl: profile.personal.avatarUrl || seededMessage.fromUserPhoto || null, name: profile.personal.name !== EMPLOYEE_EMPTY_VALUE ? profile.personal.name : seededMessage.fromUserName || "HR", email: profile.personal.email !== EMPLOYEE_EMPTY_VALUE ? profile.personal.email : seededMessage.fromUserEmail || null }] as const;
          }
        } catch (error) {
          console.error("employee_message_sender_lookup_failed", { senderUid, error });
        }

        return [senderUid, { avatarUrl: seededMessage.fromUserPhoto || null, name: seededMessage.fromUserName || "HR", email: seededMessage.fromUserEmail || null }] as const;
      })
    ).then(entries => {
      if (cancelled) return;
      setMessageSenderLookup(Object.fromEntries(entries.filter((entry): entry is readonly [string, MessageSenderProfile] => Boolean(entry))));
    });

    return () => {
      cancelled = true;
    };
  }, [activeConversation, coworkersByUid, currentUserAvatarUrl, currentUserDisplayName, user?.email, user?.uid]);

  const markConversationAsRead = async (conversation: EmployeeMessageConversationRecord) => {
    if (!user?.uid) return;
    const unreadIncomingMessages = conversation.messages.filter(message => message.toUserId === user.uid && !message.isRead);
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
      setOpeningConversationId(current => (current === conversation.id ? null : current));
    }
  };

  useEffect(() => {
    if (activeConversation) {
      void markConversationAsRead(activeConversation);
    }
  }, [activeConversation, user?.uid]);

  const unreadMessagesCount = messages.filter(message => message.toUserId === user?.uid && !message.isRead).length;
  const readMessagesCount = messages.length - unreadMessagesCount;
  const hrUnreadCount = hrConversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const internalUnreadCount = internalConversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  const handleSendHrReply = async () => {
    if (!user?.uid || !activeHrConversation) return;
    const normalizedReply = hrReplyBody.trim();
    if (!normalizedReply) return toast.error("اكتب الرد أولًا.");
    const parentMessage = activeHrConversation.messages[activeHrConversation.messages.length - 1];
    if (!parentMessage || !activeHrConversation.counterpartyUid) return toast.error("تعذر ربط الرد بالمحادثة الحالية.");

    setSendingHrReply(true);
    try {
      const messageRef = doc(collection(db, EMPLOYEE_MESSAGES_COLLECTION));
      await setDoc(messageRef, {
        employeeId: activeHrConversation.employeeId || null,
        employeeUid: activeHrConversation.employeeUid || user.uid,
        conversationId: activeHrConversation.conversationId,
        threadId: activeHrConversation.threadId || activeHrConversation.conversationId,
        conversationType: "hr_to_employee",
        participantUids: buildEmployeeMessageParticipants(user.uid, activeHrConversation.counterpartyUid),
        senderUid: user.uid,
        senderRole: "employee",
        recipientUid: activeHrConversation.counterpartyUid,
        messageType: "message",
        body: normalizedReply,
        status: "sent",
        fromUserId: user.uid,
        fromUserName: currentUserDisplayName,
        fromUserEmail: user.email || null,
        fromUserPhoto: currentUserAvatarUrl || null,
        toUserId: activeHrConversation.counterpartyUid,
        toUserName: activeHrConversation.counterpartyName || "HR",
        toUserEmail: activeHrConversation.counterpartyEmail || null,
        toUserPhoto: activeHrConversation.counterpartyPhoto || null,
        message: normalizedReply,
        type: "message",
        relatedTo: "employee_message",
        relatedId: parentMessage.id,
        createdAt: serverTimestamp(),
        isRead: false,
        readAt: null,
        updatedAt: serverTimestamp(),
      } satisfies EmployeeMessageDoc);

      await createInAppNotification({
        userId: activeHrConversation.counterpartyUid,
        title: "رد جديد من الموظف",
        body: normalizedReply,
        type: "message",
        relatedId: messageRef.id,
        relatedTo: "employee_message",
        relatedPath: activeHrConversation.employeeId ? `/admin/employees?employeeId=${encodeURIComponent(activeHrConversation.employeeId)}&panel=messages&messageId=${messageRef.id}` : `/admin/employees?panel=messages&messageId=${messageRef.id}`,
      }).catch(error => {
        console.error("employee_reply_notification_failed", error);
      });

      setHrReplyBody("");
      toast.success("تم إرسال الرد داخل نفس المحادثة.");
    } catch (error) {
      console.error("employee_reply_send_failed", error);
      toast.error("تعذر إرسال الرد الآن.");
    } finally {
      setSendingHrReply(false);
    }
  };

  const handleSendInternalMessage = async () => {
    if (!user?.uid || !selectedInternalRecipient?.uid) return;
    const normalizedMessage = internalMessageBody.trim();
    if (!normalizedMessage) return toast.error("اكتب نص الرسالة أولًا.");
    if (selectedInternalRecipient.uid === user.uid) return toast.error("لا يمكن إرسال رسالة إلى نفسك.");

    const conversationId = activeInternalConversation?.conversationId || buildEmployeePeerConversationId(user.uid, selectedInternalRecipient.uid);
    if (!conversationId) return toast.error("تعذر تجهيز المحادثة الداخلية.");

    setSendingInternalMessage(true);
    try {
      const messageRef = doc(collection(db, EMPLOYEE_MESSAGES_COLLECTION));
      const parentMessage = activeInternalConversation?.messages[activeInternalConversation.messages.length - 1] || null;
      await setDoc(messageRef, {
        employeeId: null,
        employeeUid: null,
        conversationId,
        threadId: conversationId,
        conversationType: "employee_to_employee",
        participantUids: buildEmployeeMessageParticipants(user.uid, selectedInternalRecipient.uid),
        senderUid: user.uid,
        senderRole: "employee",
        recipientUid: selectedInternalRecipient.uid,
        messageType: "message",
        body: normalizedMessage,
        status: "sent",
        fromUserId: user.uid,
        fromUserName: currentUserDisplayName,
        fromUserEmail: user.email || null,
        fromUserPhoto: currentUserAvatarUrl || null,
        toUserId: selectedInternalRecipient.uid,
        toUserName: selectedInternalRecipient.name,
        toUserEmail: selectedInternalRecipient.email || null,
        toUserPhoto: selectedInternalRecipient.avatarUrl || null,
        message: normalizedMessage,
        type: "message",
        relatedTo: parentMessage ? "employee_message" : null,
        relatedId: parentMessage?.id || null,
        createdAt: serverTimestamp(),
        isRead: false,
        readAt: null,
        updatedAt: serverTimestamp(),
      } satisfies EmployeeMessageDoc);

      await createInAppNotification({
        userId: selectedInternalRecipient.uid,
        title: `رسالة داخلية جديدة من ${currentUserDisplayName}`,
        body: normalizedMessage,
        type: "message",
        relatedId: messageRef.id,
        relatedTo: "employee_message",
        relatedPath: `/employee/messages?messageId=${messageRef.id}`,
      }).catch(error => {
        console.error("employee_internal_notification_failed", error);
      });

      setInternalMessageBody("");
      setActiveSection("internal");
      setActiveInternalConversationId(conversationId);
      setSelectedInternalRecipientUid(selectedInternalRecipient.uid);
      toast.success("تم إرسال الرسالة الداخلية بنجاح.");
    } catch (error) {
      console.error("employee_internal_message_send_failed", error);
      toast.error("تعذر إرسال الرسالة الداخلية.");
    } finally {
      setSendingInternalMessage(false);
    }
  };

  if (!user) return null;

  return (
    <EmployeeLayout title="رسائلي الداخلية" description="تابع رسائل HR ومحادثات الزملاء من نفس المسار، مع فصل واضح بين الرسائل الإدارية والمحادثات الداخلية بين الموظفين.">
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <MessagesStat label="إجمالي الرسائل" value={String(messages.length)} />
          <MessagesStat label="رسائل HR" value={String(hrConversations.length)} />
          <MessagesStat label="محادثات داخلية" value={String(internalConversations.length)} />
          <MessagesStat label="غير مقروءة" value={String(unreadMessagesCount)} tone="warning" />
        </div>

        <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_28px_80px_-52px_rgba(15,23,42,0.28)]">
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              <MessageSquare className="h-4 w-4" />
              مركز الرسائل
            </div>
            <CardTitle className="text-xl font-semibold text-slate-950">رسائل HR والمحادثات الداخلية</CardTitle>
            <CardDescription className="text-sm leading-7 text-slate-600">
              هذا المسار يعرض نوعين منفصلين بوضوح: رسائل HR الرسمية، والمحادثات الداخلية بين الموظفين. كل محادثة تُعرض مع الطرف الآخر وآخر تحديث وعدد الرسائل غير المقروءة إن وجد.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs value={activeSection} onValueChange={value => setActiveSection(value as ConversationSectionKey)} dir="rtl" className="space-y-6">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-[22px] bg-slate-100 p-1">
                <TabsTrigger value="hr" className="rounded-[18px] px-4 py-3 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <span className="flex items-center gap-2"><Mail className="h-4 w-4" />رسائل HR{hrUnreadCount > 0 ? <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">{hrUnreadCount}</Badge> : null}</span>
                </TabsTrigger>
                <TabsTrigger value="internal" className="rounded-[18px] px-4 py-3 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4" />محادثة داخلية{internalUnreadCount > 0 ? <Badge className="rounded-full bg-sky-600 text-white hover:bg-sky-600">{internalUnreadCount}</Badge> : null}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="hr" className="mt-0">
                <ConversationWorkspace
                  sectionLabel="HR"
                  listLabel="سجل رسائل HR"
                  listDescription="هذه القائمة مخصصة فقط للرسائل الإدارية مع HR."
                  conversations={loading ? [] : hrConversations}
                  activeConversation={activeHrConversation}
                  activeConversationId={activeHrConversationId}
                  openingConversationId={openingConversationId}
                  currentUserUid={user.uid}
                  currentUserDisplayName={currentUserDisplayName}
                  currentUserAvatarUrl={currentUserAvatarUrl}
                  messageSenderLookup={messageSenderLookup}
                  onSelectConversation={conversation => {
                    setActiveSection("hr");
                    setActiveHrConversationId(conversation.id);
                    void markConversationAsRead(conversation);
                  }}
                  onCloseConversation={() => setActiveHrConversationId(null)}
                  emptyListTitle={loading ? "جارٍ تحميل الرسائل..." : "لا توجد رسائل HR حاليًا"}
                  emptyListDescription={loading ? "لحظات قليلة..." : "عندما تصلك رسالة أو تنبيه من HR سيظهر هنا مباشرة."}
                  emptyConversationTitle="اختر محادثة HR من القائمة"
                  emptyConversationDescription="ستظهر تفاصيل المحادثة هنا بمجرد اختيار أي سجل من القائمة الجانبية."
                  composer={
                    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5">
                      <div className="mb-4 space-y-1">
                        <div className="text-sm font-semibold text-slate-900">الرد داخل نفس محادثة HR</div>
                        <p className="text-sm leading-6 text-slate-500">يذهب الرد إلى HR داخل نفس السجل الحالي مع الحفاظ على التسلسل الزمني وحالة القراءة.</p>
                      </div>
                      <Textarea value={hrReplyBody} onChange={event => setHrReplyBody(event.target.value)} placeholder={activeHrConversation ? "اكتب ردك هنا" : "اختر محادثة HR أولًا حتى تتمكن من الرد"} className="min-h-36 resize-y bg-white text-right leading-7 [direction:rtl]" disabled={!activeHrConversation || sendingHrReply} />
                      <div className="mt-4 flex flex-wrap justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => setHrReplyBody("")} disabled={sendingHrReply || !hrReplyBody.trim()}>إعادة ضبط</Button>
                        <Button type="button" className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]" onClick={() => void handleSendHrReply()} disabled={!activeHrConversation || sendingHrReply}>{sendingHrReply ? "جارٍ الإرسال..." : "إرسال الرد"}</Button>
                      </div>
                    </div>
                  }
                />
              </TabsContent>

              <TabsContent value="internal" className="mt-0">
                <ConversationWorkspace
                  sectionLabel="الموظف"
                  listLabel="المحادثات الداخلية"
                  listDescription="هذه القائمة مخصصة لتواصل الموظفين مع بعضهم داخل النظام."
                  conversations={loading ? [] : internalConversations}
                  activeConversation={activeInternalConversation}
                  activeConversationId={activeInternalConversationId}
                  openingConversationId={openingConversationId}
                  currentUserUid={user.uid}
                  currentUserDisplayName={currentUserDisplayName}
                  currentUserAvatarUrl={currentUserAvatarUrl}
                  messageSenderLookup={messageSenderLookup}
                  onSelectConversation={conversation => {
                    setActiveSection("internal");
                    setActiveInternalConversationId(conversation.id);
                    setSelectedInternalRecipientUid(conversation.counterpartyUid);
                    void markConversationAsRead(conversation);
                  }}
                  onCloseConversation={() => {
                    setActiveInternalConversationId(null);
                    setSelectedInternalRecipientUid("");
                  }}
                  emptyListTitle={loading ? "جارٍ تحميل المحادثات..." : "لا توجد محادثات داخلية بعد"}
                  emptyListDescription={loading ? "لحظات قليلة..." : "ابدأ رسالة جديدة إلى أحد زملائك وسيظهر السجل هنا مباشرة."}
                  emptyConversationTitle="اختر محادثة داخلية أو ابدأ رسالة جديدة"
                  emptyConversationDescription="يمكنك فتح أي محادثة داخلية من القائمة أو اختيار موظف جديد من أداة الإرسال أدناه."
                  emptyConversationContent={internalEmptyConversationContent}
                  composer={
                    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">رسالة إلى موظف</div>
                          <p className="text-sm leading-6 text-slate-500">اختر موظفًا نشطًا من زملائك ثم أرسل رسالة نصية داخلية.</p>
                        </div>
                        <Button type="button" variant="outline" onClick={() => { setActiveSection("internal"); setActiveInternalConversationId(null); setSelectedInternalRecipientUid(""); setRecipientPickerOpen(true); }}>رسالة جديدة</Button>
                      </div>

                      <div className="space-y-4">
                        <RecipientPicker options={coworkers} selectedRecipient={selectedInternalRecipient} loading={coworkersLoading} disabled={coworkersLoading || sendingInternalMessage} open={recipientPickerOpen} onOpenChange={setRecipientPickerOpen} onSelect={uid => { setActiveSection("internal"); setSelectedInternalRecipientUid(uid); const existingConversation = internalConversations.find(conversation => conversation.counterpartyUid === uid) || null; setActiveInternalConversationId(existingConversation?.id || null); if (existingConversation) void markConversationAsRead(existingConversation); }} />
                        {coworkersError ? <p className="text-xs leading-6 text-rose-600">{coworkersError}</p> : null}
                        <Textarea value={internalMessageBody} onChange={event => setInternalMessageBody(event.target.value)} placeholder={selectedInternalRecipient ? `اكتب رسالتك إلى ${selectedInternalRecipient.name}` : "اختر الموظف المستلم أولًا ثم اكتب الرسالة"} className="min-h-36 resize-y bg-white text-right leading-7 [direction:rtl]" disabled={!selectedInternalRecipient || sendingInternalMessage} />
                        <div className="flex flex-wrap justify-end gap-3">
                          <Button type="button" variant="outline" onClick={() => setInternalMessageBody("")} disabled={sendingInternalMessage || !internalMessageBody.trim()}>إعادة ضبط</Button>
                          <Button type="button" className="bg-sky-700 text-white hover:bg-sky-800" onClick={() => void handleSendInternalMessage()} disabled={!selectedInternalRecipient || sendingInternalMessage || Boolean(coworkersError)}>{sendingInternalMessage ? "جارٍ الإرسال..." : "إرسال الرسالة الداخلية"}</Button>
                        </div>
                      </div>
                    </div>
                  }
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 text-sm leading-7 text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            {unreadMessagesCount > 0 ? <Clock3 className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            حالة الرسائل
          </div>
          <p className="mt-3">عند فتح أي محادثة يتم تحديث الرسائل الواردة لك كمقروءة، وتبقى المحادثات الداخلية منفصلة بصريًا ووظيفيًا عن رسائل HR.</p>
          <p className="mt-2">تمت القراءة: {readMessagesCount} رسالة، وغير المقروءة: {unreadMessagesCount} رسالة.</p>
        </div>
      </section>
    </EmployeeLayout>
  );
}
