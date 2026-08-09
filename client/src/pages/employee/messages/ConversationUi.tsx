import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Inbox, Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Language } from "@/contexts/LanguageContext";
import { formatDateTimeEN } from "@/lib/formatters";
import { languageDir, tr } from "@/lib/i18n";
import type { EmployeeCoworkerOption } from "@/lib/employeeCoworkers";
import type {
  EmployeeMessageConversationRecord,
  EmployeeMessageRecord,
} from "@/lib/employeeMessages";
import { cn } from "@/lib/utils";
import type { EmployeeConversationType } from "@shared/employee";

export type MessageSenderProfile = {
  avatarUrl: string | null;
  name: string;
  email: string | null;
};

function formatMessageDate(value: Date | null, language: Language) {
  if (!value) return "";
  if (language === "ar") return formatDateTimeEN(value);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function messageTypeLabel(value: string, language: Language) {
  if (language === "ar") return value;
  const normalized = String(value || "").trim();
  const labels: Record<string, string> = {
    "رسالة": "Message",
    "رد": "Reply",
    "تنبيه": "Alert",
    "مهمة يومية": "Daily Task",
    "تقرير أسبوعي": "Weekly Report",
    "ملف": "File",
  };
  return labels[normalized] || normalized || "Message";
}

function conversationTypeLabel(value: string, isInternal: boolean, language: Language) {
  if (language === "ar") return value;
  return isInternal ? "Internal Conversation" : "HR Message";
}

export function initialsFromName(name: string, email?: string | null) {
  const source = String(name || email || "").trim();
  if (!source) return "مو";

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

export function MessagesStat({
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

export function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function RecipientOptionCard({
  option,
  isSelected,
  unreadCount = 0,
  disabled,
  onSelect,
}: {
  option: EmployeeCoworkerOption;
  isSelected: boolean;
  unreadCount?: number;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "group flex min-w-[84px] shrink-0 flex-col items-center gap-2 rounded-[20px] px-2 py-2 text-center transition-all",
        isSelected
          ? "bg-sky-50 ring-2 ring-sky-500/70"
          : "hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-60"
      )}
      dir="rtl"
      title={option.name}
    >
      <div className="relative">
        <Avatar
          className={cn(
            "h-14 w-14 border bg-slate-100 shadow-sm transition-all",
            isSelected ? "border-sky-300" : "border-slate-200"
          )}
        >
          <AvatarImage
            src={option.avatarUrl || undefined}
            alt={option.name}
            className="object-cover"
          />
          <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">
            {initialsFromName(option.name, option.email)}
          </AvatarFallback>
        </Avatar>

        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
            {unreadCount}
          </span>
        ) : null}
      </div>

      <div className="w-full">
        <div
          className={cn(
            "mx-auto max-w-[88px] truncate text-xs font-semibold transition-colors",
            isSelected ? "text-sky-700" : "text-slate-800"
          )}
          title={option.name}
        >
          {option.name}
        </div>
      </div>
    </button>
  );
}

export function RecipientPicker({
  options,
  selectedRecipient,
  unreadCountsByUid = {},
  language = "ar",
  loading,
  disabled,
  open,
  onOpenChange,
  onSelect,
}: {
  options: EmployeeCoworkerOption[];
  selectedRecipient: EmployeeCoworkerOption | null;
  unreadCountsByUid?: Record<string, number>;
  language?: Language;
  loading: boolean;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (uid: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;

    return options.filter(option =>
      [
        option.name,
        option.email || "",
        option.department || "",
        option.title || "",
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    );
  }, [options, searchQuery]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  useEffect(() => {
    onOpenChange(true);
  }, [onOpenChange]);

  return (
    <div
      className="min-w-0 max-w-full space-y-4 overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm"
      dir={languageDir(language)}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 text-right">
          <div className="text-sm font-semibold text-slate-950">
            {tr(language, "اختر الموظف", "Choose Employee")}
          </div>
        </div>

        <Badge
          variant="outline"
          className="rounded-full border-slate-200 bg-slate-50 text-slate-600 shadow-none"
        >
          {searchQuery
            ? `${filteredOptions.length} ${tr(language, "نتيجة", "results")}`
            : `${options.length} ${tr(language, "موظف", "employees")}`}
        </Badge>
      </div>

      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={tr(language, "ابحث بالاسم أو البريد أو المسمى أو القسم", "Search by name, email, title, or department")}
          className="h-11 rounded-2xl border-slate-200 bg-slate-50 ps-11 text-start shadow-none placeholder:text-slate-400 focus-visible:border-sky-300 focus-visible:ring-sky-100"
          dir={languageDir(language)}
          disabled={disabled}
        />
      </div>

      {loading ? (
        <div className="max-w-full overflow-x-auto pb-1">
          <div className="flex w-max items-start gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex min-w-[84px] shrink-0 flex-col items-center gap-2 px-2 py-2"
            >
              <div className="h-14 w-14 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3 w-16 animate-pulse rounded-full bg-slate-200" />
            </div>
          ))}
          </div>
        </div>
      ) : filteredOptions.length ? (
        <div className="max-w-full overflow-x-auto overscroll-x-contain pb-2 pt-2">
          <div className="flex w-max items-start gap-3 pr-1">
            {filteredOptions.map(option => (
              <RecipientOptionCard
                key={option.uid}
                option={option}
                isSelected={selectedRecipient?.uid === option.uid}
                unreadCount={unreadCountsByUid[option.uid] || 0}
                disabled={disabled}
                onSelect={() => {
                  onSelect(option.uid);
                  setSearchQuery("");
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
          <div className="text-sm font-semibold text-slate-900">
            {tr(language, "لا توجد نتائج مطابقة", "No matching results")}
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            {tr(language, "جرّب البحث باسم مختلف أو بالبريد أو بالقسم للعثور على الموظف.", "Try another name, email, or department to find the employee.")}
          </p>
        </div>
      )}
    </div>
  );
}

export function ConversationListItem({
  conversation,
  isActive,
  viewerUid,
  isOpening,
  language = "ar",
  onClick,
}: {
  conversation: EmployeeMessageConversationRecord;
  isActive: boolean;
  viewerUid: string;
  isOpening: boolean;
  language?: Language;
  onClick: () => void;
}) {
  const latestMessage = conversation.latestMessage;
  const latestFromViewer = latestMessage.fromUserId === viewerUid;
  const isInternal = conversation.conversationType === "employee_to_employee";
  const counterpartyName =
    conversation.counterpartyName || (isInternal ? tr(language, "موظف", "Employee") : "HR");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full min-w-0 rounded-[18px] border px-3.5 py-3 text-right shadow-sm transition-all",
        isActive
          ? "border-sky-200 bg-sky-50/80 shadow-[0_18px_38px_-30px_rgba(2,132,199,0.28)]"
          : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/90"
      )}
      dir={languageDir(language)}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3 pr-1">
            <Avatar
              className={cn(
                "h-11 w-11 shrink-0 border bg-slate-100",
                isActive ? "border-sky-200" : "border-slate-200"
              )}
            >
              <AvatarImage
                src={conversation.counterpartyPhoto || undefined}
                alt={counterpartyName}
                className="object-cover"
              />
              <AvatarFallback className="bg-slate-900 text-[11px] font-semibold text-white">
                {initialsFromName(counterpartyName, conversation.counterpartyEmail)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-950">
                  {counterpartyName}
                </span>

                {conversation.unreadCount > 0 ? (
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[#F2B705] px-2 py-0.5 text-[11px] font-semibold text-slate-950">
                    {conversation.unreadCount}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full shadow-none",
                    isInternal
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  )}
                >
                  {conversationTypeLabel(conversation.conversationTypeLabel, isInternal, language)}
                </Badge>

                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 bg-slate-50 text-slate-600 shadow-none"
                >
                  {messageTypeLabel(latestMessage.typeLabel, language)}
                </Badge>

                {isActive ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-sky-200 bg-white text-sky-700 shadow-none"
                  >
                    {tr(language, "الحالية", "Current")}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="shrink-0 whitespace-nowrap pt-1 text-[11px] text-slate-500">
            {conversation.lastMessageAtDate
              ? formatMessageDate(conversation.lastMessageAtDate, language)
              : tr(language, "تاريخ غير متوفر", "Date unavailable")}
          </div>
        </div>

        <div className="rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <div className="min-w-0 text-[13px] leading-6 text-slate-600 line-clamp-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {latestMessage.preview || tr(language, "لا يوجد نص محفوظ لهذه الرسالة.", "No text saved for this message.")}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="truncate">
              {latestFromViewer
                ? tr(language, "آخر تحديث منك", "Last update from you")
                : `${tr(language, "آخر تحديث من", "Last update from")} ${counterpartyName}`}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                {conversation.messages.length} {tr(language, "رسالة", "messages")}
              </span>

              {isOpening ? (
                <span className="text-sky-700">{tr(language, "جارٍ تحديث القراءة...", "Updating read status...")}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export function MessageBubble({
  message,
  ownMessage,
  senderName,
  senderEmail,
  avatarUrl,
  viewerName: _viewerName,
  conversationType: _conversationType,
  language = "ar",
}: {
  message: EmployeeMessageRecord;
  ownMessage: boolean;
  senderName: string;
  senderEmail: string | null;
  avatarUrl: string | null;
  viewerName: string;
  conversationType: EmployeeConversationType;
  language?: Language;
}) {
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
      className={cn(
        "flex items-end gap-2.5",
        ownMessage ? "justify-end" : "justify-start"
      )}
      dir="ltr"
    >
      {!ownMessage ? avatarNode : null}

      <div
        className={cn(
          "max-w-[82%] rounded-[20px] px-4 py-3 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.45)] sm:max-w-[74%]",
          ownMessage
            ? "rounded-br-md bg-slate-950 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-900"
        )}
        dir={languageDir(language)}
      >
        {!ownMessage ? (
          <div className="mb-1.5 truncate text-xs font-bold text-slate-600">
            {senderName}
          </div>
        ) : null}

        <div
          className={cn(
            "whitespace-pre-wrap break-words text-[0.95rem] leading-7 [overflow-wrap:anywhere]",
            ownMessage ? "text-white" : "text-slate-800"
          )}
        >
          {message.body ||
            tr(
              language,
              "لا يوجد نص محفوظ لهذه الرسالة.",
              "No text saved for this message."
            )}
        </div>

        <div
          className={cn(
            "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]",
            ownMessage ? "text-white/60" : "text-slate-400"
          )}
        >
          <span>
            {message.createdAtDate
              ? formatMessageDate(message.createdAtDate, language)
              : tr(language, "تاريخ غير متوفر", "Date unavailable")}
          </span>

          {ownMessage ? (
            <span>
              {message.isRead
                ? tr(language, "مقروءة", "Read")
                : tr(language, "تم الإرسال", "Sent")}
            </span>
          ) : null}
        </div>
      </div>

      {ownMessage ? avatarNode : null}
    </div>
  );
}

function ConversationListSection({
  listLabel,
  listDescription,
  conversations,
  activeConversationId,
  openingConversationId,
  currentUserUid,
  language = "ar",
  onSelectConversation,
  emptyListTitle,
  emptyListDescription,
}: {
  listLabel: string;
  listDescription: string;
  conversations: EmployeeMessageConversationRecord[];
  activeConversationId: string | null;
  openingConversationId: string | null;
  currentUserUid: string;
  language?: Language;
  onSelectConversation: (
    conversation: EmployeeMessageConversationRecord
  ) => void;
  emptyListTitle: string;
  emptyListDescription: string;
}) {
  return (
    <section dir={languageDir(language)} className="space-y-4 text-start">
      <div className="border-b border-slate-200/80 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-950">
              {listLabel}
            </h2>
            <p className="text-sm leading-6 text-slate-500">
              {listDescription}
            </p>
          </div>
          {conversations.length ? (
            <Badge
              variant="outline"
              className="rounded-full border-slate-200 bg-white text-slate-600 shadow-none"
            >
              {conversations.length} {tr(language, "سجل", "records")}
            </Badge>
          ) : null}
        </div>
      </div>

      {conversations.length ? (
        <ScrollArea className="h-[520px] pr-1 overflow-visible">
          <div className="space-y-2.5 pl-1">
            {conversations.map(conversation => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                viewerUid={currentUserUid}
                isOpening={openingConversationId === conversation.id}
                language={language}
                onClick={() => onSelectConversation(conversation)}
              />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
          <div className="font-semibold text-slate-800">{emptyListTitle}</div>
          <div className="mt-2 leading-7">{emptyListDescription}</div>
        </div>
      )}
    </section>
  );
}

export function ConversationWorkspace({
  sectionLabel,
  listLabel,
  listDescription,
  hideConversationList = false,
  conversations,
  activeConversation,
  activeConversationId,
  openingConversationId,
  currentUserUid,
  currentUserDisplayName,
  currentUserAvatarUrl,
  messageSenderLookup,
  language = "ar",
  onSelectConversation,
  onCloseConversation,
  emptyListTitle,
  emptyListDescription,
  emptyConversationTitle,
  emptyConversationDescription,
  emptyConversationContent,
  composer,
}: {
  sectionLabel: string;
  listLabel: string;
  listDescription: string;
  hideConversationList?: boolean;
  conversations: EmployeeMessageConversationRecord[];
  activeConversation: EmployeeMessageConversationRecord | null;
  activeConversationId: string | null;
  openingConversationId: string | null;
  currentUserUid: string;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  messageSenderLookup: Record<string, MessageSenderProfile>;
  language?: Language;
  onSelectConversation: (
    conversation: EmployeeMessageConversationRecord
  ) => void;
  onCloseConversation: () => void;
  emptyListTitle: string;
  emptyListDescription: string;
  emptyConversationTitle: string;
  emptyConversationDescription: string;
  emptyConversationContent?: ReactNode;
  composer: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-6",
        hideConversationList
          ? "grid-cols-1"
          : "xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:gap-8"
      )}
    >
      {hideConversationList ? null : (
        <ConversationListSection
          listLabel={listLabel}
          listDescription={listDescription}
          conversations={conversations}
          activeConversationId={activeConversationId}
          openingConversationId={openingConversationId}
          currentUserUid={currentUserUid}
          language={language}
          onSelectConversation={onSelectConversation}
          emptyListTitle={emptyListTitle}
          emptyListDescription={emptyListDescription}
        />
      )}

      <div
        className={cn(
          "space-y-4",
          hideConversationList ? "" : "xl:border-l xl:border-slate-200/70 xl:pl-6"
        )}
        dir={languageDir(language)}
      >
        <div className="space-y-5 text-start">
          {activeConversation ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-4">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-none"
                    >
                      {tr(language, "آخر تحديث:", "Last Update:")}{" "}
                      {activeConversation.lastMessageAtDate
                        ? formatMessageDate(activeConversation.lastMessageAtDate, language)
                        : tr(language, "غير متوفر", "Unavailable")}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-slate-950">
                      {activeConversation.counterpartyName || sectionLabel}
                    </div>
                    <p className="text-sm leading-6 text-slate-500">
                      {activeConversation.counterpartyEmail ||
                        (activeConversation.conversationType ===
                          "employee_to_employee"
                          ? tr(language, "سجل المحادثة الداخلية الحالي بينك وبين الموظف المحدد.", "Current internal conversation record between you and the selected employee.")
                          : tr(language, "هذا السجل مخصص للرسائل الرسمية مع HR داخل نفس المسار.", "This record is for official HR messages in this thread."))}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full shadow-none",
                        activeConversation.conversationType ===
                          "employee_to_employee"
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700]"
                      )}
                    >
                      {conversationTypeLabel(
                        activeConversation.conversationTypeLabel,
                        activeConversation.conversationType === "employee_to_employee",
                        language
                      )}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-200 bg-white text-slate-600 shadow-none"
                    >
                      {messageTypeLabel(activeConversation.latestMessage.typeLabel, language)}
                    </Badge>
                    {activeConversation.unreadCount > 0 ? (
                      <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                        {activeConversation.unreadCount} {tr(language, "جديد", "new")}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={onCloseConversation}
                >
                  {tr(language, "إغلاق", "Close")}
                </Button>
              </div>

              <div className="space-y-4 pt-1">
                {activeConversation.messages.map(message => {
                  const ownMessage = message.fromUserId === currentUserUid;
                  const senderId = message.fromUserId || message.senderUid || "";
                  const senderProfile = senderId
                    ? messageSenderLookup[senderId]
                    : null;
                  const senderName =
                    senderProfile?.name ||
                    message.fromUserName ||
                    (ownMessage
                      ? currentUserDisplayName
                      : activeConversation.counterpartyName);
                  const senderEmail =
                    senderProfile?.email ||
                    message.fromUserEmail ||
                    (ownMessage ? null : activeConversation.counterpartyEmail);
                  const avatarUrl =
                    senderProfile?.avatarUrl ||
                    message.fromUserPhoto ||
                    (ownMessage
                      ? currentUserAvatarUrl
                      : activeConversation.counterpartyPhoto);

                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      ownMessage={ownMessage}
                      senderName={senderName}
                      senderEmail={senderEmail}
                      avatarUrl={avatarUrl}
                      viewerName={currentUserDisplayName}
                      conversationType={activeConversation.conversationType}
                      language={language}
                    />
                  );
                })}
              </div>
            </div>
          ) : emptyConversationContent ? (
            emptyConversationContent
          ) : (
            <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-white/90">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="bg-[#F2B705]/12 text-[#030640]"
                >
                  <Inbox className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{emptyConversationTitle}</EmptyTitle>
                <EmptyDescription>
                  {emptyConversationDescription}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        {composer}
      </div>
    </div>
  );
}
