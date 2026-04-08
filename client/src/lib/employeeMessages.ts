import { toDateSafe } from "@/lib/formatters";
import {
  EMPLOYEE_MESSAGE_TYPES,
  type EmployeeMessageDoc,
  type EmployeeMessageRole,
  type EmployeeMessageStatus,
  type EmployeeMessageType,
} from "@shared/employee";

export const EMPLOYEE_MESSAGE_TYPE_OPTIONS: Array<{
  value: EmployeeMessageType;
  label: string;
}> = [
  { value: "message", label: "رسالة" },
  { value: "notice", label: "تنبيه" },
  { value: "system", label: "إشعار نظام" },
];

export type EmployeeMessageRecord = EmployeeMessageDoc & {
  id: string;
  conversationId: string;
  threadId: string;
  senderUid: string;
  senderRole: EmployeeMessageRole;
  recipientUid: string;
  body: string;
  messageType: EmployeeMessageType;
  status: EmployeeMessageStatus;
  createdAtDate: Date | null;
  readAtDate: Date | null;
  typeLabel: string;
  preview: string;
};

export type EmployeeMessageConversationRecord = {
  id: string;
  conversationId: string;
  threadId: string;
  employeeId: string | null;
  employeeUid: string;
  messages: EmployeeMessageRecord[];
  latestMessage: EmployeeMessageRecord;
  unreadCount: number;
};

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function normalizeMessageType(value: unknown) {
  const normalized = String(value || "message").trim().toLowerCase();
  return (EMPLOYEE_MESSAGE_TYPES.some(type => type === normalized)
    ? normalized
    : "message") as EmployeeMessageType;
}

function normalizeMessageRole(
  value: unknown,
  options: { senderUid?: string; employeeUid?: string }
) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized) return normalized as EmployeeMessageRole;
  if (options.senderUid && options.employeeUid && options.senderUid === options.employeeUid) {
    return "employee";
  }
  return "hr";
}

function normalizeMessageStatus(value: unknown, isRead: boolean) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized) return normalized as EmployeeMessageStatus;
  return isRead ? "read" : "sent";
}

export function getEmployeeMessageTypeLabel(value: unknown) {
  const normalized = normalizeMessageType(value);
  return (
    EMPLOYEE_MESSAGE_TYPE_OPTIONS.find(option => option.value === normalized)?.label ||
    "رسالة"
  );
}

export function normalizeEmployeeMessageRecord(
  id: string,
  raw: Record<string, any> | null | undefined
): EmployeeMessageRecord {
  const message = pickText(raw?.body, raw?.message);
  const normalizedType = normalizeMessageType(raw?.messageType ?? raw?.type);
  const senderUid = pickText(raw?.senderUid, raw?.fromUserId);
  const recipientUid = pickText(raw?.recipientUid, raw?.toUserId);
  const conversationId = pickText(raw?.conversationId, raw?.threadId) || id;
  const threadId = pickText(raw?.threadId, raw?.conversationId) || conversationId;
  const isRead = Boolean(raw?.isRead);
  const senderRole = normalizeMessageRole(raw?.senderRole, {
    senderUid,
    employeeUid: pickText(raw?.employeeUid),
  });
  const status = normalizeMessageStatus(raw?.status, isRead);

  return {
    id,
    employeeId: pickText(raw?.employeeId) || null,
    employeeUid: pickText(raw?.employeeUid),
    conversationId,
    threadId,
    senderUid,
    senderRole,
    recipientUid,
    messageType: normalizedType,
    body: message,
    status,
    fromUserId: senderUid,
    fromUserName: pickText(raw?.fromUserName) || null,
    fromUserEmail: pickText(raw?.fromUserEmail) || null,
    fromUserPhoto:
      pickText(raw?.fromUserPhoto, raw?.fromUserAvatar, raw?.senderPhoto) ||
      null,
    toUserId: recipientUid,
    toUserName: pickText(raw?.toUserName) || null,
    toUserEmail: pickText(raw?.toUserEmail) || null,
    toUserPhoto:
      pickText(raw?.toUserPhoto, raw?.toUserAvatar, raw?.recipientPhoto) ||
      null,
    message,
    type: normalizedType,
    relatedTo: pickText(raw?.relatedTo) || null,
    relatedId: pickText(raw?.relatedId) || null,
    createdAt: raw?.createdAt ?? null,
    isRead,
    readAt: raw?.readAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
    createdAtDate: toDateSafe(raw?.createdAt),
    readAtDate: toDateSafe(raw?.readAt),
    typeLabel: getEmployeeMessageTypeLabel(normalizedType),
    preview: message.length > 120 ? `${message.slice(0, 117).trim()}...` : message,
  };
}

export function sortEmployeeMessages<T extends EmployeeMessageDoc>(messages: T[]) {
  return [...messages].sort((left, right) => {
    const leftTime = toDateSafe(left.createdAt)?.getTime() ?? 0;
    const rightTime = toDateSafe(right.createdAt)?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

export function sortEmployeeMessagesChronologically<T extends EmployeeMessageDoc>(messages: T[]) {
  return [...messages].sort((left, right) => {
    const leftTime = toDateSafe(left.createdAt)?.getTime() ?? 0;
    const rightTime = toDateSafe(right.createdAt)?.getTime() ?? 0;
    return leftTime - rightTime;
  });
}

export function groupEmployeeMessageConversations(
  messages: EmployeeMessageRecord[],
  viewerUid?: string | null
) {
  const grouped = new Map<string, EmployeeMessageRecord[]>();

  messages.forEach(message => {
    const key = pickText(message.conversationId, message.threadId, message.id) || message.id;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(message);
      return;
    }
    grouped.set(key, [message]);
  });

  return Array.from(grouped.entries())
    .map(([conversationId, group]) => {
      const timeline = sortEmployeeMessagesChronologically(group);
      const latestMessage = timeline[timeline.length - 1];
      return {
        id: conversationId,
        conversationId,
        threadId: latestMessage.threadId || conversationId,
        employeeId:
          latestMessage.employeeId ||
          timeline.find(message => pickText(message.employeeId))?.employeeId ||
          null,
        employeeUid:
          latestMessage.employeeUid ||
          timeline.find(message => pickText(message.employeeUid))?.employeeUid ||
          "",
        messages: timeline,
        latestMessage,
        unreadCount: viewerUid
          ? timeline.filter(message => message.toUserId === viewerUid && !message.isRead).length
          : 0,
      } satisfies EmployeeMessageConversationRecord;
    })
    .sort((left, right) => {
      const leftTime = left.latestMessage.createdAtDate?.getTime() ?? 0;
      const rightTime = right.latestMessage.createdAtDate?.getTime() ?? 0;
      return rightTime - leftTime;
    });
}
