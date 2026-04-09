import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Inbox, Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDateTimeEN } from "@/lib/formatters";
import type { EmployeeCoworkerOption } from "@/lib/employeeCoworkers";
import type {
  EmployeeMessageConversationRecord,
  EmployeeMessageRecord,
} from "@/lib/employeeMessages";
import type { EmployeeConversationType } from "@shared/employee";

export type MessageSenderProfile = {
  avatarUrl: string | null;
  name: string;
  email: string | null;
};

export function initialsFromName(name: string, email?: string | null) {
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

export function MetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function LegacyRecipientPicker({
  options,
  selectedRecipient,
  loading,
  disabled,
  open,
  onOpenChange,
  onSelect,
}: {
  options: EmployeeCoworkerOption[];
  selectedRecipient: EmployeeCoworkerOption | null;
  loading: boolean;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (uid: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between rounded-2xl border-slate-200 bg-white px-4 py-6 text-right text-sm text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <span className="truncate">
            {selectedRecipient
              ? selectedRecipient.name
              : loading
                ? "جارٍ تحميل الموظفين..."
                : "اختر موظفًا لإرسال الرسالة"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[360px] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command shouldFilter>
          <CommandInput placeholder="ابحث بالاسم أو البريد أو القسم" />
          <CommandList>
            <CommandEmpty>لا يوجد موظفون مطابقون للبحث.</CommandEmpty>
            <CommandGroup heading="الموظفون النشطون">
              {options.map(option => (
                <CommandItem
                  key={option.uid}
                  value={[
                    option.name,
                    option.email || "",
                    option.department || "",
                    option.title || "",
                  ]
                    .join(" ")
                    .trim()}
                  onSelect={() => {
                    onSelect(option.uid);
                    onOpenChange(false);
                  }}
                  className="items-start gap-3 py-3"
                >
                  <Avatar className="mt-0.5 h-9 w-9 border border-slate-200 bg-slate-100">
                    <AvatarImage
                      src={option.avatarUrl || undefined}
                      alt={option.name}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-slate-900 text-[11px] font-semibold text-white">
                      {initialsFromName(option.name, option.email)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1 text-right" dir="rtl">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-semibold text-slate-900">
                        {option.name}
                      </span>
                      {selectedRecipient?.uid === option.uid ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {option.email || "لا يوجد بريد إلكتروني"}
                    </div>
                    {option.title || option.department ? (
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {[option.title, option.department].filter(Boolean).join(" • ")}
                      </div>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function RecipientPicker({
  options,
  selectedRecipient,
  loading,
  disabled,
  open,
  onOpenChange,
  onSelect,
}: {
  options: EmployeeCoworkerOption[];
  selectedRecipient: EmployeeCoworkerOption | null;
  loading: boolean;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (uid: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const selectedMeta = [selectedRecipient?.title, selectedRecipient?.department]
    .filter(Boolean)
    .join(" - ");
  const filteredOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;

    return options.filter(option =>
      [option.name, option.email || "", option.department || "", option.title || ""]
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

  return (
    <Popover
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen) {
          setSearchQuery("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="h-auto min-h-[78px] w-full justify-between rounded-[24px] border-slate-200 bg-white px-5 py-4 text-right text-sm text-slate-900 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.32)] transition-all hover:border-slate-300 hover:bg-slate-50"
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Avatar className="h-12 w-12 border border-slate-200 bg-slate-100 shadow-sm">
              <AvatarImage
                src={selectedRecipient?.avatarUrl || undefined}
                alt={selectedRecipient?.name || "المستلم"}
                className="object-cover"
              />
              <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">
                {selectedRecipient
                  ? initialsFromName(selectedRecipient.name, selectedRecipient.email)
                  : "مو"}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 text-right" dir="rtl">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                المستلم
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-950">
                {selectedRecipient
                  ? selectedRecipient.name
                  : loading
                    ? "جارٍ تحميل الموظفين..."
                    : "اختر موظفًا لإرسال الرسالة"}
              </div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {selectedRecipient
                  ? selectedRecipient.email || selectedMeta || "جاهز لبدء محادثة داخلية"
                  : "ابحث بالاسم أو البريد أو القسم ثم اختر الموظف المناسب"}
              </div>
            </div>
          </div>

          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-slate-500 transition-transform",
              open ? "rotate-180" : ""
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[min(720px,calc(100vw-2rem))] rounded-[28px] border border-slate-200/90 bg-white p-0 shadow-[0_32px_90px_-40px_rgba(15,23,42,0.42)]"
      >
        <div className="border-b border-slate-200/80 px-5 py-4 text-right">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-950">
                اختر موظفًا لبدء أو متابعة المحادثة
              </div>
              <p className="text-sm leading-6 text-slate-500">
                ابحث بالاسم أو البريد أو القسم، ثم اختر الموظف من القائمة أدناه.
              </p>
            </div>
            <Badge
              variant="outline"
              className="rounded-full border-slate-200 bg-slate-50 text-slate-600 shadow-none"
            >
              {options.length} موظف نشط
            </Badge>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="ابحث بالاسم أو البريد أو المسمى أو القسم"
              className="h-12 rounded-2xl border-slate-200 bg-slate-50 pr-11 text-right shadow-none placeholder:text-slate-400 focus-visible:border-sky-300 focus-visible:ring-sky-100"
              dir="rtl"
            />
          </div>
        </div>

        <ScrollArea className="max-h-[420px]">
          <div className="space-y-3 p-4">
            {filteredOptions.length ? (
              filteredOptions.map(option => {
                const isSelected = selectedRecipient?.uid === option.uid;
                const meta = [option.title, option.department].filter(Boolean).join(" - ");

                return (
                  <button
                    key={option.uid}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onSelect(option.uid);
                      setSearchQuery("");
                      onOpenChange(false);
                    }}
                    className={cn(
                      "w-full rounded-[22px] border bg-white px-4 py-4 text-right shadow-sm transition-all",
                      isSelected
                        ? "border-sky-300 bg-sky-50 shadow-[0_18px_40px_-30px_rgba(14,116,144,0.35)]"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_18px_40px_-32px_rgba(15,23,42,0.18)]"
                    )}
                    dir="rtl"
                  >
                    <div className="flex items-start gap-4">
                      <Avatar className="mt-0.5 h-12 w-12 border border-slate-200 bg-slate-100 shadow-sm">
                        <AvatarImage
                          src={option.avatarUrl || undefined}
                          alt={option.name}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">
                          {initialsFromName(option.name, option.email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-950">
                              {option.name}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500">
                              {option.email || "لا يوجد بريد إلكتروني"}
                            </div>
                          </div>

                          {isSelected ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                              <Check className="h-3.5 w-3.5" />
                              المختار
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {option.title ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-slate-200 bg-slate-50 text-slate-600 shadow-none"
                            >
                              {option.title}
                            </Badge>
                          ) : null}
                          {option.department ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-slate-200 bg-slate-50 text-slate-600 shadow-none"
                            >
                              {option.department}
                            </Badge>
                          ) : null}
                          {!option.title && !option.department ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-slate-200 bg-slate-50 text-slate-500 shadow-none"
                            >
                              بيانات وظيفية محدودة
                            </Badge>
                          ) : null}
                        </div>

                        {meta ? (
                          <div className="mt-3 text-xs leading-6 text-slate-500">
                            {meta}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
                <div className="text-sm font-semibold text-slate-900">
                  لا توجد نتائج مطابقة
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  جرّب البحث باسم مختلف أو بالبريد أو بالقسم للعثور على الموظف.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function ConversationListItem({
  conversation,
  isActive,
  viewerUid,
  isOpening,
  onClick,
}: {
  conversation: EmployeeMessageConversationRecord;
  isActive: boolean;
  viewerUid: string;
  isOpening: boolean;
  onClick: () => void;
}) {
  const latestMessage = conversation.latestMessage;
  const latestFromViewer = latestMessage.fromUserId === viewerUid;
  const isInternal = conversation.conversationType === "employee_to_employee";

  return (
    <button
      type="button"
      onClick={onClick}
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
                  : isInternal
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              )}
            >
              {conversation.conversationTypeLabel}
            </Badge>
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
            {conversation.unreadCount > 0 ? (
              <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                {conversation.unreadCount} جديد
              </Badge>
            ) : null}
          </div>

          <div className="mt-3 min-w-0 truncate text-sm font-semibold">
            {conversation.counterpartyName || (isInternal ? "موظف" : "HR")}
          </div>
          <div
            className={cn(
              "mt-2 min-w-0 text-right text-sm leading-7 line-clamp-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
              isActive ? "text-white/80" : "text-slate-600"
            )}
          >
            {latestMessage.preview || "لا يوجد نص محفوظ لهذه الرسالة."}
          </div>
        </div>

        <div
          className={cn(
            "shrink-0 whitespace-nowrap pt-0.5 text-[11px]",
            isActive ? "text-white/70" : "text-slate-500"
          )}
        >
          {conversation.lastMessageAtDate
            ? formatDateTimeEN(conversation.lastMessageAtDate)
            : "تاريخ غير متوفر"}
        </div>
      </div>

      <div
        className={cn(
          "mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs",
          isActive ? "border-white/10 text-white/70" : "border-slate-200 text-slate-500"
        )}
      >
        <span>{conversation.messages.length} رسالة داخل السجل</span>
        <span>
          {latestFromViewer
            ? "آخر تحديث منك"
            : `آخر تحديث من ${conversation.counterpartyName || (isInternal ? "الموظف" : "HR")}`}
        </span>
      </div>

      {isOpening ? (
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
}

export function MessageBubble({
  message,
  ownMessage,
  senderName,
  senderEmail,
  avatarUrl,
  viewerName,
  conversationType,
}: {
  message: EmployeeMessageRecord;
  ownMessage: boolean;
  senderName: string;
  senderEmail: string | null;
  avatarUrl: string | null;
  viewerName: string;
  conversationType: EmployeeConversationType;
}) {
  const isInternal = conversationType === "employee_to_employee";
  const incomingAccentClass = isInternal
    ? "border-sky-200 bg-sky-50/80 text-slate-900"
    : "border-[#E7D8AA] bg-[#FBF7E8] text-slate-900";

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
        "flex items-start gap-3",
        ownMessage ? "justify-end" : "justify-start"
      )}
      dir="ltr"
    >
      {ownMessage ? (
        <>
          <div className="max-w-[72%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right text-slate-800 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.32)]" dir="rtl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-700 shadow-none">
                {viewerName}
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-500 shadow-none">
                {isInternal ? "رسالة داخلية" : "رسالة موظف"}
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-500 shadow-none">
                {message.typeLabel}
              </Badge>
            </div>

            <div className="mt-3 whitespace-pre-wrap break-words text-[0.97rem] leading-8 text-slate-800 [overflow-wrap:anywhere]">
              {message.body || "لا يوجد نص محفوظ لهذه الرسالة."}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-xs text-slate-500">
              <span>{message.createdAtDate ? formatDateTimeEN(message.createdAtDate) : "تاريخ غير متوفر"}</span>
              <span>
                {message.isRead && message.readAtDate
                  ? `تمت القراءة في ${formatDateTimeEN(message.readAtDate)}`
                  : "بانتظار القراءة"}
              </span>
            </div>
          </div>
          {avatarNode}
        </>
      ) : (
        <>
          {avatarNode}
          <div className={cn("max-w-[72%] rounded-2xl border px-4 py-3 text-right shadow-[0_18px_40px_-32px_rgba(15,23,42,0.32)]", incomingAccentClass)} dir="rtl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("rounded-full bg-white shadow-none", isInternal ? "border-sky-200 text-sky-700" : "border-[#E7D8AA] text-[#8b6700]")}>
                {senderName}
              </Badge>
              <Badge variant="outline" className={cn("rounded-full shadow-none", isInternal ? "border-sky-200 bg-sky-100/70 text-sky-700" : "border-[#E7D8AA] bg-[#F8F2DD] text-[#8b6700]")}>
                {isInternal ? "محادثة داخلية" : "رسالة HR"}
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-500 shadow-none">
                {message.typeLabel}
              </Badge>
            </div>

            <div className="mt-3 whitespace-pre-wrap break-words text-[0.97rem] leading-8 text-slate-800 [overflow-wrap:anywhere]">
              {message.body || "لا يوجد نص محفوظ لهذه الرسالة."}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-xs text-slate-500">
              <span>{message.createdAtDate ? formatDateTimeEN(message.createdAtDate) : "تاريخ غير متوفر"}</span>
              <span>{isInternal ? "واردة من الموظف" : "واردة من HR"}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ConversationWorkspace({
  sectionLabel,
  listLabel,
  listDescription,
  conversations,
  activeConversation,
  activeConversationId,
  openingConversationId,
  currentUserUid,
  currentUserDisplayName,
  currentUserAvatarUrl,
  messageSenderLookup,
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
  conversations: EmployeeMessageConversationRecord[];
  activeConversation: EmployeeMessageConversationRecord | null;
  activeConversationId: string | null;
  openingConversationId: string | null;
  currentUserUid: string;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  messageSenderLookup: Record<string, MessageSenderProfile>;
  onSelectConversation: (conversation: EmployeeMessageConversationRecord) => void;
  onCloseConversation: () => void;
  emptyListTitle: string;
  emptyListDescription: string;
  emptyConversationTitle: string;
  emptyConversationDescription: string;
  emptyConversationContent?: ReactNode;
  composer: ReactNode;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div dir="rtl" className="space-y-4">
        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-4 text-right">
          <div className="mb-2 text-sm font-semibold text-slate-900">{listLabel}</div>
          <p className="mb-4 text-sm leading-7 text-slate-500">{listDescription}</p>

          {conversations.length ? (
            <ScrollArea className="h-[520px] pr-1">
              <div className="space-y-2">
                {conversations.map(conversation => (
                  <ConversationListItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={conversation.id === activeConversationId}
                    viewerUid={currentUserUid}
                    isOpening={openingConversationId === conversation.id}
                    onClick={() => onSelectConversation(conversation)}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              <div className="font-semibold text-slate-800">{emptyListTitle}</div>
              <div className="mt-2 leading-7">{emptyListDescription}</div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4" dir="rtl">
        <div className="space-y-5 text-right">
          {activeConversation ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn("rounded-full shadow-none", activeConversation.conversationType === "employee_to_employee" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700]")}>
                    {activeConversation.conversationTypeLabel}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600 shadow-none">
                    {activeConversation.latestMessage.typeLabel}
                  </Badge>
                </div>

                <Button type="button" variant="outline" onClick={onCloseConversation}>
                  إغلاق
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <MetaCard label="الطرف الآخر" value={activeConversation.counterpartyName || sectionLabel} />
                <MetaCard label="آخر تحديث" value={activeConversation.lastMessageAtDate ? formatDateTimeEN(activeConversation.lastMessageAtDate) : "غير متوفر"} />
                <MetaCard label="غير المقروء" value={String(activeConversation.unreadCount)} />
              </div>

              <div className="space-y-4 pt-1">
                {activeConversation.messages.map(message => {
                  const ownMessage = message.fromUserId === currentUserUid;
                  const senderId = message.fromUserId || message.senderUid || "";
                  const senderProfile = senderId ? messageSenderLookup[senderId] : null;
                  const senderName = senderProfile?.name || message.fromUserName || (ownMessage ? currentUserDisplayName : activeConversation.counterpartyName);
                  const senderEmail = senderProfile?.email || message.fromUserEmail || (ownMessage ? null : activeConversation.counterpartyEmail);
                  const avatarUrl = senderProfile?.avatarUrl || message.fromUserPhoto || (ownMessage ? currentUserAvatarUrl : activeConversation.counterpartyPhoto);

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
                <EmptyMedia variant="icon" className="bg-[#F2B705]/12 text-[#030640]">
                  <Inbox className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{emptyConversationTitle}</EmptyTitle>
                <EmptyDescription>{emptyConversationDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        {composer}
      </div>
    </div>
  );
}
