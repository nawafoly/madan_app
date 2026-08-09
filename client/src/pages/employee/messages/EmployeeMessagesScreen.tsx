import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquare,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";

import { useAuth } from "@/_core/hooks/useAuth";
import EmployeeLayout from "@/components/EmployeeLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchActiveEmployeeCoworkers,
  type EmployeeCoworkerOption,
} from "@/lib/employeeCoworkers";
import {
  buildEmployeeMessageParticipants,
  buildEmployeePeerConversationId,
  groupEmployeeMessageConversations,
  normalizeEmployeeMessageRecord,
  type EmployeeMessageConversationRecord,
  type EmployeeMessageRecord,
} from "@/lib/employeeMessages";
import { resolveEmployeeAvatarUrl } from "@/lib/defaultEmployeeAvatars";
import { createInAppNotification } from "@/lib/inAppNotifications";
import {
  createHrCoreEmployeeMessage,
  listHrCoreEmployeeMessages,
  markHrCoreEmployeeMessagesRead,
} from "@/lib/hrCoreApi";
import { languageDir, tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  MessageBubble,
  MessagesStat,
  RecipientPicker,
  initialsFromName,
  type MessageSenderProfile,
} from "@/pages/employee/messages/ConversationUi";
import { type EmployeeMessageDoc } from "@shared/employee";

type ConversationSectionKey = "hr" | "internal";
type InboxFilterKey = "all" | "unread" | "hr" | "internal";

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
    name: conversation.counterpartyName || "Employee",
    email: conversation.counterpartyEmail,
    avatarUrl: conversation.counterpartyPhoto,
    title: null,
    department: null,
    statusKey: "active",
  } satisfies EmployeeCoworkerOption;
}

function formatInboxDate(value: Date | null, language: "ar" | "en") {
  if (!value) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default function EmployeeMessagesScreen() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const dir = languageDir(language);
  const [, setLocation] = useLocation();
  const search = useSearch();

  const [legacyMessages, setLegacyMessages] = useState<EmployeeMessageRecord[]>(
    []
  );
  const [participantMessages, setParticipantMessages] = useState<
    EmployeeMessageRecord[]
  >([]);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [participantLoading, setParticipantLoading] = useState(true);
  const [activeSection, setActiveSection] =
    useState<ConversationSectionKey>("hr");
  const [activeHrConversationId, setActiveHrConversationId] = useState<
    string | null
  >(null);
  const [activeInternalConversationId, setActiveInternalConversationId] =
    useState<string | null>(null);
  const [openingConversationId, setOpeningConversationId] = useState<
    string | null
  >(null);
  const [hrReplyBody, setHrReplyBody] = useState("");
  const [internalMessageBody, setInternalMessageBody] = useState("");
  const [sendingHrReply, setSendingHrReply] = useState(false);
  const [sendingInternalMessage, setSendingInternalMessage] = useState(false);
  const [messageSenderLookup, setMessageSenderLookup] = useState<
    Record<string, MessageSenderProfile>
  >({});
  const [coworkers, setCoworkers] = useState<EmployeeCoworkerOption[]>([]);
  const [coworkersLoading, setCoworkersLoading] = useState(true);
  const [coworkersError, setCoworkersError] = useState("");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [selectedInternalRecipientUid, setSelectedInternalRecipientUid] =
    useState("");
  const [inboxFilter, setInboxFilter] = useState<InboxFilterKey>("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const handledMessageSearchRef = useRef("");
  const conversationScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const requestedWorkspaceSection = useMemo(() => {
    const requestedTab = String(searchParams.get("tab") || "").trim().toLowerCase();
    if (requestedTab === "hr" || requestedTab === "internal") {
      return requestedTab as ConversationSectionKey;
    }
    return null;
  }, [searchParams]);
  const requestedWeeklyReport = useMemo(
    () =>
      String(searchParams.get("tab") || "")
        .trim()
        .toLowerCase() === "weekly_report",
    [searchParams]
  );
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

    let cancelled = false;
    setLegacyLoading(true);
    setParticipantLoading(true);

    void listHrCoreEmployeeMessages({ participantUid: user.uid, limit: 200 })
      .then(response => {
        if (cancelled) return;
        const rows = response.employeeMessages.map(message =>
          normalizeEmployeeMessageRecord(
            message.id,
            message as Record<string, any>
          )
        );
        setLegacyMessages(rows);
        setParticipantMessages([]);
      })
      .catch(error => {
        console.error("employee_messages_hr_core_load_failed", error);
        if (!cancelled) {
          setLegacyMessages([]);
          setParticipantMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLegacyLoading(false);
          setParticipantLoading(false);
        }
      });

    return () => {
      cancelled = true;
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
    () =>
      conversations.filter(
        conversation => conversation.conversationType !== "employee_to_employee"
      ),
    [conversations]
  );
  const internalConversations = useMemo(
    () =>
      conversations.filter(
        conversation => conversation.conversationType === "employee_to_employee"
      ),
    [conversations]
  );
  const sortedConversations = useMemo(
    () =>
      [...conversations].sort(
        (left, right) =>
          (right.lastMessageAtDate?.getTime() || 0) -
          (left.lastMessageAtDate?.getTime() || 0)
      ),
    [conversations]
  );
  const mixedLatestMessages = useMemo(
    () =>
      conversations
        .flatMap(conversation =>
          conversation.messages.map(message => ({ conversation, message }))
        )
        .sort(
          (left, right) =>
            (right.message.createdAtDate?.getTime() || 0) -
            (left.message.createdAtDate?.getTime() || 0)
        )
        .slice(0, 60),
    [conversations]
  );
  const filteredConversations = useMemo(() => {
    const normalizedSearch = conversationSearch.trim().toLocaleLowerCase();
    return sortedConversations.filter(conversation => {
      const isInternal =
        conversation.conversationType === "employee_to_employee";
      if (inboxFilter === "hr" && isInternal) return false;
      if (inboxFilter === "internal" && !isInternal) return false;
      if (inboxFilter === "unread" && conversation.unreadCount <= 0) return false;
      if (!normalizedSearch) return true;

      return [
        conversation.counterpartyName,
        conversation.counterpartyEmail,
        conversation.latestMessage.preview,
        conversation.conversationTypeLabel,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    });
  }, [conversationSearch, inboxFilter, sortedConversations]);
  const requestedConversationId = useMemo(
    () =>
      messages.find(message => message.id === requestedMessageId)
        ?.conversationId || null,
    [messages, requestedMessageId]
  );

  useEffect(() => {
    if (requestedWeeklyReport) {
      setLocation("/hr/weekly-reports");
    }
  }, [requestedWeeklyReport, setLocation]);

  useEffect(() => {
    if (requestedWorkspaceSection) {
      setActiveSection(requestedWorkspaceSection);
      return;
    }

    if (
      requestedConversationId &&
      search &&
      handledMessageSearchRef.current !== search
    ) {
      const targetConversation =
        conversations.find(
          conversation => conversation.id === requestedConversationId
        ) || null;
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
  }, [
    conversations,
    requestedConversationId,
    requestedMessageId,
    requestedWorkspaceSection,
    search,
  ]);

  const activeHrConversation = useMemo(
    () =>
      hrConversations.find(
        conversation => conversation.id === activeHrConversationId
      ) || null,
    [activeHrConversationId, hrConversations]
  );
  const activeInternalConversation = useMemo(
    () =>
      internalConversations.find(
        conversation => conversation.id === activeInternalConversationId
      ) || null,
    [activeInternalConversationId, internalConversations]
  );
  const activeConversation =
    activeSection === "internal"
      ? activeInternalConversation
      : activeSection === "hr"
        ? activeHrConversation
        : null;
  const coworkersByUid = useMemo(
    () => new Map(coworkers.map(coworker => [coworker.uid, coworker])),
    [coworkers]
  );
  const currentUserDisplayName = useMemo(
    () => user?.displayName || user?.email || tr(language, "أنت", "You"),
    [language, user?.displayName, user?.email]
  );
  const currentUserAvatarUrl = useMemo(() => {
    const currentUser = user as {
      photoURL?: string | null;
      avatarUrl?: string | null;
      firebaseUser?: { photoURL?: string | null } | null;
      gender?: string | null;
    } | null;
    return resolveEmployeeAvatarUrl(
      currentUser?.avatarUrl ||
        currentUser?.photoURL ||
        currentUser?.firebaseUser?.photoURL,
      {
        uid: user?.uid,
        name: currentUserDisplayName,
        email: user?.email,
        gender: currentUser?.gender,
      }
    );
  }, [currentUserDisplayName, user]);
  const selectedInternalRecipient = useMemo(() => {
    if (activeInternalConversation) {
      return (
        coworkersByUid.get(activeInternalConversation.counterpartyUid) ||
        buildRecipientFromConversation(activeInternalConversation)
      );
    }
    return selectedInternalRecipientUid
      ? coworkersByUid.get(selectedInternalRecipientUid) || null
      : null;
  }, [
    activeInternalConversation,
    coworkersByUid,
    selectedInternalRecipientUid,
  ]);
  const conversationPaneOpen = Boolean(
    activeConversation || selectedInternalRecipient
  );

  const internalEmptyConversationContent = useMemo(() => {
    if (!selectedInternalRecipient) return null;

    return (
      <div className="min-h-[420px] rounded-[24px] border border-sky-100 bg-sky-50/40 p-6 text-start" dir={dir}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-full border-sky-200 bg-white text-sky-700 shadow-none"
          >
            {tr(language, "محادثة داخلية جديدة", "New Internal Conversation")}
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-slate-200 bg-white text-slate-600 shadow-none"
          >
            {tr(language, "لم تبدأ الرسائل بعد", "No messages yet")}
          </Badge>
        </div>

        <div className="mt-5 space-y-2">
          <div className="text-lg font-semibold text-slate-950">
            {selectedInternalRecipient.name}
          </div>
          <p className="text-sm leading-7 text-slate-600">
            {tr(
              language,
              "تم اختيار هذا الموظف كمستلم. اكتب الرسالة الأولى بالأسفل وسيتم إنشاء المحادثة مباشرة داخل السجل الداخلي.",
              "This employee has been selected as the recipient. Write the first message below to create the internal conversation."
            )}
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
              {tr(language, "المستلم", "Recipient")}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {selectedInternalRecipient.name}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
              {tr(language, "البريد", "Email")}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {selectedInternalRecipient.email || tr(language, "غير متوفر", "Unavailable")}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
              {tr(language, "القسم / المسمى", "Department / Title")}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">
              {[
                selectedInternalRecipient.title,
                selectedInternalRecipient.department,
              ]
                .filter(Boolean)
                .join(" - ") || tr(language, "غير متوفر", "Unavailable")}
            </div>
          </div>
        </div>
      </div>
    );
  }, [
    coworkersError,
    dir,
    internalMessageBody,
    language,
    selectedInternalRecipient,
    sendingInternalMessage,
  ]);

  useEffect(() => {
    if (activeInternalConversation?.counterpartyUid) {
      setSelectedInternalRecipientUid(
        activeInternalConversation.counterpartyUid
      );
    }
  }, [activeInternalConversation?.counterpartyUid]);

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
    void Promise.all(
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
              name: seededMessage.fromUserName || currentUserDisplayName,
              email: seededMessage.fromUserEmail || user?.email || null,
            },
          ] as const;
        }

        const peerMessagePhoto =
          activeConversation?.messages.find(
            message =>
              (message.toUserId || message.recipientUid) === senderUid &&
              Boolean(message.toUserPhoto)
          )?.toUserPhoto || null;
        const coworker = coworkersByUid.get(senderUid);

        if (coworker) {
          return [
            senderUid,
            {
              avatarUrl:
                coworker.avatarUrl ||
                seededMessage.fromUserPhoto ||
                peerMessagePhoto ||
                activeConversation?.counterpartyPhoto ||
                null,
              name: coworker.name,
              email: coworker.email || seededMessage.fromUserEmail || null,
            },
          ] as const;
        }

        return [
          senderUid,
          {
            avatarUrl:
              seededMessage.fromUserPhoto ||
              peerMessagePhoto ||
              activeConversation?.counterpartyPhoto ||
              null,
            name: seededMessage.fromUserName || activeConversation?.counterpartyName || "HR",
            email: seededMessage.fromUserEmail || null,
          },
        ] as const;
      })
    ).then(entries => {
      if (cancelled) return;
      setMessageSenderLookup(
        Object.fromEntries(
          entries.filter(
            (entry): entry is readonly [string, MessageSenderProfile] =>
              Boolean(entry)
          )
        )
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeConversation,
    coworkersByUid,
    currentUserAvatarUrl,
    currentUserDisplayName,
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
      const ids = unreadIncomingMessages.map(message => message.id);
      await markHrCoreEmployeeMessagesRead(ids);
      const now = new Date();
      setLegacyMessages(current =>
        current.map(message =>
          ids.includes(message.id)
            ? {
                ...message,
                isRead: true,
                status: "read",
                readAt: now,
                readAtDate: now,
              }
            : message
        )
      );
      setParticipantMessages(current =>
        current.map(message =>
          ids.includes(message.id)
            ? {
                ...message,
                isRead: true,
                status: "read",
                readAt: now,
                readAtDate: now,
              }
            : message
        )
      );
    } catch (error) {
      console.error("employee_message_mark_read_failed", error);
    } finally {
      setOpeningConversationId(current =>
        current === conversation.id ? null : current
      );
    }
  };

  const selectConversation = (conversation: EmployeeMessageConversationRecord) => {
    if (conversation.conversationType === "employee_to_employee") {
      setActiveSection("internal");
      setActiveInternalConversationId(conversation.id);
      setSelectedInternalRecipientUid(conversation.counterpartyUid);
    } else {
      setActiveSection("hr");
      setActiveHrConversationId(conversation.id);
    }
    void markConversationAsRead(conversation);
  };

  const closeConversation = () => {
    setActiveHrConversationId(null);
    setActiveInternalConversationId(null);
    setSelectedInternalRecipientUid("");
    setHrReplyBody("");
    setInternalMessageBody("");
  };

  const scrollConversationToBottom = (behavior: ScrollBehavior = "auto") => {
    const container = conversationScrollRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  };

  const handleConversationScroll = () => {
    const container = conversationScrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 120;
  };

  useEffect(() => {
    if (!activeConversation) return;

    shouldStickToBottomRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      scrollConversationToBottom("auto");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!activeConversation || !shouldStickToBottomRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      scrollConversationToBottom("smooth");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeConversation?.messages.length]);

  useEffect(() => {
    if (activeConversation) {
      void markConversationAsRead(activeConversation);
    }
  }, [activeConversation, user?.uid]);

  const unreadMessagesCount = messages.filter(
    message => message.toUserId === user?.uid && !message.isRead
  ).length;
  const readMessagesCount = messages.length - unreadMessagesCount;
  const hrUnreadCount = hrConversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0
  );
  const internalUnreadCount = internalConversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0
  );
  const internalUnreadCountsByUid = useMemo(() => {
    const counts: Record<string, number> = {};
    internalConversations.forEach(conversation => {
      if (!conversation.counterpartyUid || conversation.unreadCount <= 0) return;
      counts[conversation.counterpartyUid] = conversation.unreadCount;
    });

    if (activeInternalConversation?.counterpartyUid) {
      counts[activeInternalConversation.counterpartyUid] = 0;
    }

    return counts;
  }, [activeInternalConversation?.counterpartyUid, internalConversations]);

  const handleSendHrReply = async () => {
    if (!user?.uid || !activeHrConversation) return;
    const normalizedReply = hrReplyBody.trim();
    if (!normalizedReply) return toast.error("اكتب الرد أولًا.");
    const parentMessage =
      activeHrConversation.messages[activeHrConversation.messages.length - 1];
    if (!parentMessage || !activeHrConversation.counterpartyUid)
      return toast.error("تعذر ربط الرد بالمحادثة الحالية.");

    setSendingHrReply(true);
    try {
      const messageId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const messagePayload = {
        employeeId: activeHrConversation.employeeId || null,
        employeeUid: activeHrConversation.employeeUid || user.uid,
        conversationId: activeHrConversation.conversationId,
        threadId:
          activeHrConversation.threadId || activeHrConversation.conversationId,
        conversationType: "hr_to_employee",
        participantUids: buildEmployeeMessageParticipants(
          user.uid,
          activeHrConversation.counterpartyUid
        ),
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
        createdAt: nowIso,
        isRead: false,
        readAt: null,
        updatedAt: nowIso,
      } satisfies EmployeeMessageDoc;

      const response = await createHrCoreEmployeeMessage({
        id: messageId,
        ...messagePayload,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      const created = normalizeEmployeeMessageRecord(
        response.employeeMessage.id,
        response.employeeMessage as Record<string, any>
      );
      setLegacyMessages(current => [...current, created]);

      await createInAppNotification({
        userId: activeHrConversation.counterpartyUid,
        title: "رد جديد من الموظف",
        body: normalizedReply,
        type: "message",
        relatedId: messageId,
        relatedTo: "employee_message",
        relatedPath: activeHrConversation.employeeId
          ? `/hr/employees?employeeId=${encodeURIComponent(activeHrConversation.employeeId)}&panel=messages&messageId=${messageId}`
          : `/hr/employees?panel=messages&messageId=${messageId}`,
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
    if (selectedInternalRecipient.uid === user.uid)
      return toast.error("لا يمكن إرسال رسالة إلى نفسك.");

    const conversationId =
      activeInternalConversation?.conversationId ||
      buildEmployeePeerConversationId(user.uid, selectedInternalRecipient.uid);
    if (!conversationId) return toast.error("تعذر تجهيز المحادثة الداخلية.");

    setSendingInternalMessage(true);
    try {
      const messageId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const parentMessage =
        activeInternalConversation?.messages[
        activeInternalConversation.messages.length - 1
        ] || null;

      const messagePayload = {
        employeeId: null,
        employeeUid: null,
        conversationId,
        threadId: conversationId,
        conversationType: "employee_to_employee",
        participantUids: buildEmployeeMessageParticipants(
          user.uid,
          selectedInternalRecipient.uid
        ),
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
        createdAt: nowIso,
        isRead: false,
        readAt: null,
        updatedAt: nowIso,
      } satisfies EmployeeMessageDoc;

      const response = await createHrCoreEmployeeMessage({
        id: messageId,
        ...messagePayload,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      const created = normalizeEmployeeMessageRecord(
        response.employeeMessage.id,
        response.employeeMessage as Record<string, any>
      );
      setLegacyMessages(current => [...current, created]);

      await createInAppNotification({
        userId: selectedInternalRecipient.uid,
        title: `رسالة داخلية جديدة من ${currentUserDisplayName}`,
        body: normalizedMessage,
        type: "message",
        relatedId: messageId,
        relatedTo: "employee_message",
        relatedPath: `/hr/messages?messageId=${messageId}`,
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

  const handleInternalMessageKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    if (
      !internalMessageBody.trim() ||
      !selectedInternalRecipient ||
      sendingInternalMessage ||
      Boolean(coworkersError)
    ) {
      return;
    }

    void handleSendInternalMessage();
  };

  if (!user) return null;

  return (
    <EmployeeLayout
      title={tr(language, "رسائلي الداخلية", "My Messages")}
      description={tr(
        language,
        "تابع رسائل HR ومحادثات الزملاء من نفس المسار، مع فصل واضح بين الرسائل الإدارية والمحادثات الداخلية بين الموظفين.",
        "Follow HR messages and coworker conversations in one place, with a clear split between administrative messages and internal chats."
      )}
    >
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <MessagesStat
            label={tr(language, "إجمالي الرسائل", "Total Messages")}
            value={String(messages.length)}
          />
          <MessagesStat
            label={tr(language, "رسائل HR", "HR Messages")}
            value={String(hrConversations.length)}
          />
          <MessagesStat
            label={tr(language, "محادثات داخلية", "Internal Chats")}
            value={String(internalConversations.length)}
          />
          <MessagesStat
            label={tr(language, "غير مقروءة", "Unread")}
            value={String(unreadMessagesCount)}
            tone="warning"
          />
        </div>

        <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white shadow-[0_28px_80px_-56px_rgba(15,23,42,0.32)]">
          <CardContent className="p-0">
            <div className="grid h-[calc(100dvh-190px)] min-h-[520px] max-h-[780px] xl:h-[720px] xl:grid-cols-[390px_minmax(0,1fr)]">
              <aside
                className={cn(
                  "min-h-0 border-b border-slate-200 bg-slate-50/70 p-4 xl:block xl:border-b-0 xl:border-e",
                  conversationPaneOpen ? "hidden" : "block"
                )}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
                      <MessageSquare className="h-4 w-4" />
                      {tr(language, "صندوق الرسائل", "Message Inbox")}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {tr(language, "آخر المحادثات من HR والزملاء في مكان واحد.", "Latest HR and coworker conversations in one place.")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full bg-slate-950 px-3 text-white hover:bg-slate-800"
                    onClick={() => setRecipientPickerOpen(current => !current)}
                  >
                    <Users className="h-4 w-4" />
                    {tr(language, "جديد", "New")}
                  </Button>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={conversationSearch}
                    onChange={event => setConversationSearch(event.target.value)}
                    placeholder={tr(language, "ابحث في المحادثات", "Search conversations")}
                    className="h-11 rounded-2xl border-slate-200 bg-white pe-10 text-start shadow-sm"
                    dir={dir}
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([
                    ["all", tr(language, "الكل", "All"), sortedConversations.length],
                    ["unread", tr(language, "غير مقروء", "Unread"), unreadMessagesCount],
                    ["hr", "HR", hrConversations.length],
                    ["internal", tr(language, "داخلي", "Internal"), internalConversations.length],
                  ] as Array<[InboxFilterKey, string, number]>).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={inboxFilter === key}
                      onClick={() => setInboxFilter(key)}
                      className={cn(
                        "flex h-10 items-center justify-between rounded-2xl border px-3 text-xs font-semibold transition",
                        inboxFilter === key
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
                      )}
                    >
                      <span>{label}</span>
                      <span className={cn("rounded-full px-2 py-0.5", inboxFilter === key ? "bg-white/15" : "bg-slate-100")}>
                        {count}
                      </span>
                    </button>
                  ))}
                </div>

                {recipientPickerOpen ? (
                  <div className="mt-4">
                    <RecipientPicker
                      options={coworkers}
                      selectedRecipient={selectedInternalRecipient}
                      unreadCountsByUid={internalUnreadCountsByUid}
                      language={language}
                      loading={coworkersLoading}
                      disabled={coworkersLoading || sendingInternalMessage}
                      open={recipientPickerOpen}
                      onOpenChange={setRecipientPickerOpen}
                      onSelect={uid => {
                        setActiveSection("internal");
                        setSelectedInternalRecipientUid(uid);
                        const existingConversation =
                          internalConversations.find(
                            conversation => conversation.counterpartyUid === uid
                          ) || null;
                        if (existingConversation) {
                          selectConversation(existingConversation);
                        } else {
                          setActiveHrConversationId(null);
                          setActiveInternalConversationId(null);
                        }
                      }}
                    />
                    {coworkersError ? (
                      <p className="mt-2 text-xs leading-6 text-rose-600">
                        {coworkersError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 max-h-[calc(100%-170px)] min-h-0 space-y-2 overflow-y-auto pe-1">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="h-24 animate-pulse rounded-2xl bg-white" />
                    ))
                  ) : filteredConversations.length ? (
                    filteredConversations.map(conversation => {
                      const isInternal =
                        conversation.conversationType === "employee_to_employee";
                      const isSelected = activeConversation?.id === conversation.id;
                      const title =
                        conversation.counterpartyName ||
                        (isInternal ? tr(language, "موظف", "Employee") : "HR");
                      const conversationAvatarUrl =
                        coworkersByUid.get(conversation.counterpartyUid)?.avatarUrl ||
                        conversation.counterpartyPhoto ||
                        null;

                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => selectConversation(conversation)}
                          className={cn(
                            "group w-full rounded-2xl border p-3 text-start shadow-sm transition-all",
                            isSelected
                              ? "border-[#F2B705] bg-[#fff8df] ring-2 ring-[#F2B705]/20"
                              : "border-slate-200 bg-white hover:border-[#F2B705]/70 hover:bg-white"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-11 w-11 shrink-0 rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                              <AvatarImage
                                src={conversationAvatarUrl || undefined}
                                alt={title}
                                className="object-cover"
                              />
                              <AvatarFallback
                                className={cn(
                                  "text-xs font-bold text-white",
                                  isInternal ? "bg-sky-700" : "bg-slate-950"
                                )}
                              >
                                {initialsFromName(
                                  title,
                                  conversation.counterpartyEmail
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-slate-950">
                                    {title}
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium text-slate-500">
                                    {isInternal ? tr(language, "محادثة داخلية", "Internal chat") : "HR"}
                                  </div>
                                </div>
                                <div className="shrink-0 text-[10px] text-slate-400">
                                  {formatInboxDate(conversation.lastMessageAtDate, language)}
                                </div>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
                                {conversation.latestMessage.preview ||
                                  tr(language, "لا يوجد نص محفوظ لهذه الرسالة.", "No message text saved.")}
                              </p>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  {conversation.messages.length} {tr(language, "رسالة", "messages")}
                                </span>
                                {conversation.unreadCount > 0 ? (
                                  <span className="rounded-full bg-[#F2B705] px-2.5 py-1 text-[11px] font-bold text-slate-950">
                                    {conversation.unreadCount}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                      {tr(language, "لا توجد محادثات مطابقة.", "No matching conversations.")}
                    </div>
                  )}
                </div>
              </aside>

              <div
                className={cn(
                  "min-h-0 flex-col bg-white xl:flex",
                  conversationPaneOpen ? "flex" : "hidden"
                )}
              >
                {activeConversation ? (
                  <>
                    <div className="border-b border-slate-200 bg-white px-5 py-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mb-3 h-9 rounded-full px-3 text-slate-600 xl:hidden"
                        onClick={closeConversation}
                      >
                        <span aria-hidden="true" className="text-lg leading-none">
                          {language === "ar" ? "→" : "←"}
                        </span>
                        {tr(language, "الرجوع للمحادثات", "Back to conversations")}
                      </Button>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {activeConversation.conversationType === "employee_to_employee"
                              ? tr(language, "محادثة داخلية", "Internal Conversation")
                              : "HR"}
                          </div>
                          <h2 className="mt-1 truncate text-xl font-semibold text-slate-950">
                            {activeConversation.counterpartyName || (activeConversation.conversationType === "employee_to_employee" ? tr(language, "موظف", "Employee") : "HR")}
                          </h2>
                          <p className="mt-1 text-sm text-slate-500">
                            {activeConversation.counterpartyEmail ||
                              tr(language, "سجل المحادثة المحددة", "Selected conversation thread")}
                          </p>
                        </div>
                        <Button type="button" variant="outline" className="hidden rounded-full xl:inline-flex" onClick={closeConversation}>
                          {tr(language, "عرض كل الرسائل", "All Messages")}
                        </Button>
                      </div>
                    </div>

                    <div
                      ref={conversationScrollRef}
                      onScroll={handleConversationScroll}
                      className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/60 px-4 py-5 sm:px-5"
                    >
                      {activeConversation.messages.map(message => {
                        const ownMessage = message.fromUserId === user.uid;
                        const senderId = message.fromUserId || message.senderUid || "";
                        const senderProfile = senderId ? messageSenderLookup[senderId] : null;
                        return (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            ownMessage={ownMessage}
                            senderName={
                              senderProfile?.name ||
                              message.fromUserName ||
                              (ownMessage ? currentUserDisplayName : activeConversation.counterpartyName || "HR")
                            }
                            senderEmail={senderProfile?.email || message.fromUserEmail || null}
                            avatarUrl={
                              senderProfile?.avatarUrl ||
                              message.fromUserPhoto ||
                              (!ownMessage
                                ? activeConversation.messages.find(
                                    candidate =>
                                      (candidate.toUserId || candidate.recipientUid) ===
                                        senderId && Boolean(candidate.toUserPhoto)
                                  )?.toUserPhoto
                                : null) ||
                              (ownMessage
                                ? currentUserAvatarUrl
                                : coworkersByUid.get(senderId)?.avatarUrl ||
                                  activeConversation.counterpartyPhoto)
                            }
                            viewerName={currentUserDisplayName}
                            conversationType={activeConversation.conversationType}
                            language={language}
                          />
                        );
                      })}
                    </div>

                    <div className="border-t border-slate-200 bg-white p-4">
                      <Textarea
                        value={activeConversation.conversationType === "employee_to_employee" ? internalMessageBody : hrReplyBody}
                        onChange={event =>
                          activeConversation.conversationType === "employee_to_employee"
                            ? setInternalMessageBody(event.target.value)
                            : setHrReplyBody(event.target.value)
                        }
                        onKeyDown={activeConversation.conversationType === "employee_to_employee" ? handleInternalMessageKeyDown : undefined}
                        placeholder={tr(language, "اكتب رسالتك هنا...", "Write your message here...")}
                        className="min-h-24 resize-y rounded-2xl bg-slate-50 text-start leading-7"
                        dir={dir}
                        disabled={sendingHrReply || sendingInternalMessage}
                      />
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            activeConversation.conversationType === "employee_to_employee"
                              ? setInternalMessageBody("")
                              : setHrReplyBody("")
                          }
                        >
                          {tr(language, "مسح", "Clear")}
                        </Button>
                        <Button
                          type="button"
                          className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
                          disabled={sendingHrReply || sendingInternalMessage}
                          onClick={() =>
                            activeConversation.conversationType === "employee_to_employee"
                              ? void handleSendInternalMessage()
                              : void handleSendHrReply()
                          }
                        >
                          {tr(language, "إرسال", "Send")}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : selectedInternalRecipient ? (
                  <div className="flex flex-1 flex-col">
                    <div className="border-b border-slate-200 px-5 py-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mb-3 h-9 rounded-full px-3 text-slate-600 xl:hidden"
                        onClick={closeConversation}
                      >
                        <span aria-hidden="true" className="text-lg leading-none">
                          {language === "ar" ? "→" : "←"}
                        </span>
                        {tr(language, "الرجوع للمحادثات", "Back to conversations")}
                      </Button>
                      <h2 className="text-xl font-semibold text-slate-950">
                        {selectedInternalRecipient.name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {tr(language, "محادثة داخلية جديدة", "New internal conversation")}
                      </p>
                    </div>
                    <div className="flex flex-1 items-center justify-center bg-slate-50/60 p-6 text-center text-sm text-slate-500">
                      {tr(language, "اكتب أول رسالة بالأسفل لإنشاء المحادثة.", "Write the first message below to create the conversation.")}
                    </div>
                    <div className="border-t border-slate-200 bg-white p-4">
                      <Textarea
                        value={internalMessageBody}
                        onChange={event => setInternalMessageBody(event.target.value)}
                        onKeyDown={handleInternalMessageKeyDown}
                        placeholder={`${tr(language, "اكتب رسالتك إلى", "Write your message to")} ${selectedInternalRecipient.name}`}
                        className="min-h-28 resize-y rounded-2xl bg-slate-50 text-start leading-7"
                        dir={dir}
                        disabled={sendingInternalMessage}
                      />
                      <div className="mt-3 flex justify-end gap-2">
                        <Button type="button" variant="outline" className="rounded-full" onClick={closeConversation}>
                          {tr(language, "إلغاء", "Cancel")}
                        </Button>
                        <Button type="button" className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800" onClick={() => void handleSendInternalMessage()} disabled={sendingInternalMessage || !internalMessageBody.trim()}>
                          {tr(language, "إرسال", "Send")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col">
                    <div className="border-b border-slate-200 px-5 py-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {tr(language, "كل الرسائل", "All Messages")}
                      </div>
                      <h2 className="mt-1 text-xl font-semibold text-slate-950">
                        {tr(language, "آخر الرسائل", "Latest Messages")}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {tr(language, "عرض مدمج لآخر الرسائل من كل المحادثات.", "A mixed stream of the latest messages from every conversation.")}
                      </p>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-5">
                      {loading ? (
                        Array.from({ length: 6 }).map((_, index) => (
                          <div key={index} className="h-24 animate-pulse rounded-2xl bg-white" />
                        ))
                      ) : mixedLatestMessages.length ? (
                        mixedLatestMessages.map(({ conversation, message }) => {
                          const isInternal = conversation.conversationType === "employee_to_employee";
                          const title = conversation.counterpartyName || (isInternal ? tr(language, "موظف", "Employee") : "HR");
                          return (
                            <button
                              key={message.id}
                              type="button"
                              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition hover:border-[#F2B705]/70 hover:shadow-md"
                              onClick={() => selectConversation(conversation)}
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-bold text-white", isInternal ? "bg-sky-700" : "bg-slate-950")}>
                                  {initialsFromName(title, conversation.counterpartyEmail)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="font-semibold text-slate-950">{title}</div>
                                      <div className="mt-0.5 text-xs text-slate-500">
                                        {isInternal ? tr(language, "محادثة داخلية", "Internal chat") : "HR"} · {formatInboxDate(message.createdAtDate, language)}
                                      </div>
                                    </div>
                                    {conversation.unreadCount > 0 ? (
                                      <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                                        {conversation.unreadCount}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                                    {message.preview || message.body || tr(language, "لا يوجد نص محفوظ لهذه الرسالة.", "No message text saved.")}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
                          {tr(language, "لا توجد رسائل حالياً.", "No messages yet.")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 text-sm leading-7 text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            {unreadMessagesCount > 0 ? (
              <Clock3 className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            {tr(language, "حالة الرسائل", "Message Status")}
          </div>
          <p className="mt-3">
            {tr(
              language,
              "عند فتح أي محادثة يتم تحديث الرسائل الواردة لك كمقروءة، وتبقى المحادثات الداخلية منفصلة بصريًا ووظيفيًا عن رسائل HR.",
              "Opening a conversation marks incoming messages as read. Internal conversations remain visually and functionally separate from HR messages."
            )}
          </p>
          <p className="mt-2">
            {tr(language, "تمت القراءة:", "Read:")} {readMessagesCount}{" "}
            {tr(language, "رسالة، وغير المقروءة:", "messages, unread:")}{" "}
            {unreadMessagesCount} {tr(language, "رسالة.", "messages.")}
          </p>
        </div>
      </section>
    </EmployeeLayout>
  );
}
