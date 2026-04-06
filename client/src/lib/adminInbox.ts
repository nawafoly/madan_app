import { Timestamp } from "firebase/firestore";

import { formatCurrencyEN } from "@/lib/formatters";
import { pickText } from "@/lib/investorIdentity";
import { getProjectDisplayTitleById } from "@/lib/projectDisplay";
import {
  getLinkedUserDisplayName,
  getLinkedUserEmail,
  resolveLinkedUser,
  type UserIdentityIndex,
} from "@/lib/userDisplay";

type AnyRecord = Record<string, any>;
const NEEDS_ACTION_AFTER_HOURS = 24;

export type AdminInboxSourceCollection = "interest_requests" | "messages";

export type AdminInboxItemKind =
  | "investment_request"
  | "interest_request"
  | "request_followup"
  | "incomplete_message";

export type AdminInboxTrackingStatus = "new" | "seen" | "in_progress" | "handled";

export type AdminInboxViewModel = {
  kind: AdminInboxItemKind;
  sourceCollection: AdminInboxSourceCollection;
  entityId: string;
  requestId: string | null;
  messageId: string | null;
  adminSeenAt: Date | null;
  adminReadAt: Date | null;
  adminHandledAt: Date | null;
  adminAction: string | null;
  projectId: string | null;
  projectTitle: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  amount: number | null;
  title: string;
  preview: string;
  status: string;
  stage: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  trackingStatus: AdminInboxTrackingStatus;
  isNew: boolean;
  isSeen: boolean;
  isInProgress: boolean;
  isHandled: boolean;
  needsAction: boolean;
  isUnread: boolean;
  actionLabel: string;
  actionHref: string | null;
};

export function buildAdminInboxItems<T extends { id: string } & AnyRecord>(input: {
  requests: T[];
  messages: T[];
  projectsMap: Record<string, any>;
  userIdentityIndex: UserIdentityIndex<T>;
}) {
  const requestIndex = buildRequestIndex(input.requests);

  const requestItems = input.requests.map((request) =>
    mapRequestToInboxItem({
      request,
      projectsMap: input.projectsMap,
      userIdentityIndex: input.userIdentityIndex,
    })
  );

  const messageItems = input.messages.map((message) =>
    mapMessageToInboxItem({
      message,
      linkedRequest: getLinkedRequest(message, requestIndex),
      projectsMap: input.projectsMap,
      userIdentityIndex: input.userIdentityIndex,
    })
  );

  return [...requestItems, ...messageItems].sort((a, b) => {
    const aUpdatedAt = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
    const bUpdatedAt = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
    if (bUpdatedAt !== aUpdatedAt) return bUpdatedAt - aUpdatedAt;

    const aCreatedAt = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const bCreatedAt = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return bCreatedAt - aCreatedAt;
  });
}

function buildRequestIndex<T extends { id: string } & AnyRecord>(requests: T[]) {
  const index: Record<string, T> = {};

  for (const request of requests) {
    const keys = [String(request.id || "").trim(), getRequestId(request)];
    for (const key of keys) {
      if (key && !index[key]) index[key] = request;
    }
  }

  return index;
}

function getLinkedRequest<T extends { id: string } & AnyRecord>(
  message: T,
  requestIndex: Record<string, T>
) {
  const linkedRequestId = getMessageRequestId(message);
  return linkedRequestId ? requestIndex[linkedRequestId] || null : null;
}

function mapRequestToInboxItem<T extends { id: string } & AnyRecord>(input: {
  request: T;
  projectsMap: Record<string, any>;
  userIdentityIndex: UserIdentityIndex<T>;
}): AdminInboxViewModel {
  const { request, projectsMap, userIdentityIndex } = input;
  const kind = getRequestKind(request, projectsMap);
  const requestId = getRequestId(request);
  const projectId = getProjectId(request);
  const projectTitle = resolveProjectTitle({
    source: request,
    projectId,
    linkedRequest: null,
    projectsMap,
  });
  const client = resolveClientDetails(request, userIdentityIndex);
  const createdAt = toDateSafe(
    request.createdAt || request.created_at || request.submittedAt || request.timestamp
  );
  const updatedAt = resolveUpdatedAt(request, createdAt);
  const adminSeenAt = toDateSafe(request.adminSeenAt);
  const adminHandledAt = toDateSafe(request.adminHandledAt);
  const normalizedStatus = normalizeRequestStatus(request.status);
  const normalizedStage = normalizeStageRole(request.stageRole || request.stage, request);
  const trackingState = buildTrackingState({
    seenAt: adminSeenAt,
    handledAt: adminHandledAt,
    createdAt,
    updatedAt,
    adminAction: pickText(request.adminAction) || null,
    status: normalizedStatus,
    stage: normalizedStage,
    source: request,
  });

  return {
    kind,
    sourceCollection: "interest_requests",
    entityId: String(request.id || "").trim(),
    requestId,
    messageId: null,
    adminSeenAt,
    adminReadAt: null,
    adminHandledAt,
    adminAction: pickText(request.adminAction) || null,
    projectId,
    projectTitle,
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: client.phone,
    amount: getAmountValue(request),
    title: buildRequestTitle(kind, projectTitle),
    preview: buildRequestPreview({ kind, request, projectTitle, client }),
    status: normalizedStatus,
    stage: normalizedStage,
    createdAt,
    updatedAt,
    ...trackingState,
    isUnread: trackingState.isNew,
    actionLabel: requestId ? "فتح الطلب" : "مراجعة السجل",
    actionHref: requestId ? buildRequestHref(requestId) : "/admin/messages",
  };
}

function mapMessageToInboxItem<T extends { id: string } & AnyRecord>(input: {
  message: T;
  linkedRequest: T | null;
  projectsMap: Record<string, any>;
  userIdentityIndex: UserIdentityIndex<T>;
}): AdminInboxViewModel {
  const { message, linkedRequest, projectsMap, userIdentityIndex } = input;
  const requestId = getMessageRequestId(message);
  const projectId = getProjectId(linkedRequest || message);
  const projectTitle = resolveProjectTitle({
    source: message,
    projectId,
    linkedRequest,
    projectsMap,
  });
  const client = resolveClientDetails(linkedRequest || message, userIdentityIndex, message);
  const createdAt = toDateSafe(message.createdAt || message.created_at);
  const updatedAt = resolveUpdatedAt(message, createdAt);
  const messageText = getMessageBody(message);
  const kind: AdminInboxItemKind = requestId ? "request_followup" : "incomplete_message";
  const adminReadAt = toDateSafe(message.adminReadAt);
  const adminHandledAt = toDateSafe(message.adminHandledAt);
  const normalizedStatus = normalizeRequestStatus(linkedRequest?.status || message.status);
  const normalizedStage = normalizeStageRole(
    linkedRequest?.stageRole || linkedRequest?.stage || message.stageRole || message.stage,
    linkedRequest || message
  );
  const trackingState = buildTrackingState({
    seenAt: adminReadAt,
    handledAt: adminHandledAt,
    createdAt,
    updatedAt,
    adminAction: pickText(message.adminAction, linkedRequest?.adminAction) || null,
    status: normalizedStatus,
    stage: normalizedStage,
    source: linkedRequest || message,
  });

  return {
    kind,
    sourceCollection: "messages",
    entityId: String(message.id || "").trim(),
    requestId,
    messageId: String(message.id || "").trim() || null,
    adminSeenAt: null,
    adminReadAt,
    adminHandledAt,
    adminAction: pickText(message.adminAction) || null,
    projectId,
    projectTitle,
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: client.phone,
    amount: getAmountValue(message, linkedRequest),
    title: buildMessageTitle({ kind, message, projectTitle }),
    preview: buildMessagePreview({
      kind,
      message,
      linkedRequest,
      messageText,
      projectTitle,
      client,
    }),
    status: normalizedStatus,
    stage: normalizedStage,
    createdAt,
    updatedAt,
    ...trackingState,
    isUnread: trackingState.isNew,
    actionLabel: requestId ? "فتح الطلب" : "تعليم كمقروء",
    actionHref: requestId ? buildRequestHref(requestId) : null,
  };
}

function buildRequestTitle(kind: AdminInboxItemKind, projectTitle: string) {
  const hasProject = hasValue(projectTitle) && projectTitle !== "سجل مشروع غير مكتمل";

  if (kind === "interest_request") {
    return hasProject ? `طلب اهتمام جديد في ${projectTitle}` : "طلب اهتمام جديد";
  }

  return hasProject ? `طلب استثماري جديد في ${projectTitle}` : "طلب استثماري جديد";
}

function buildRequestPreview(input: {
  kind: AdminInboxItemKind;
  request: AnyRecord;
  projectTitle: string;
  client: { name: string; email: string; phone: string };
}) {
  const { kind, request, projectTitle, client } = input;
  const explicitNote = pickText(
    request.note,
    request.message,
    request.details,
    request.description
  );
  if (explicitNote) return explicitNote;

  const missingParts = getMissingRequestParts(request, projectTitle, client);
  if (missingParts.length > 0) {
    return `سجل الطلب ناقص: ${missingParts.join("، ")}.`;
  }

  if (kind === "interest_request") {
    return "العميل سجّل اهتمامه بالمشروع ويحتاج متابعة أولية من الفريق.";
  }

  const amount = toNumberSafe(request.amount || request.requestedAmount || request.estimatedAmount);
  if (amount > 0) {
    return `طلب استثماري جديد بقيمة ${formatCurrencyEN(amount)} بانتظار المراجعة.`;
  }

  return "طلب استثماري جديد بانتظار مراجعة بيانات العميل والمشروع.";
}

function buildMessageTitle(input: {
  kind: AdminInboxItemKind;
  message: AnyRecord;
  projectTitle: string;
}) {
  const { kind, message, projectTitle } = input;

  if (kind === "incomplete_message") {
    return "رسالة غير مرتبطة بطلب معروف";
  }

  const normalizedType = String(message.type || "").trim().toLowerCase();
  const hasProject = hasValue(projectTitle) && projectTitle !== "سجل مشروع غير مكتمل";

  if (normalizedType === "client_followup") {
    return hasProject ? `متابعة عميل على ${projectTitle}` : "متابعة عميل على الطلب";
  }

  if (normalizedType.includes("reply") || normalizedType.includes("admin")) {
    return hasProject ? `رد مرتبط بطلب ${projectTitle}` : "رد مرتبط بالطلب";
  }

  return hasProject ? `عنصر محادثة مرتبط بطلب ${projectTitle}` : "عنصر محادثة مرتبط بالطلب";
}

function buildMessagePreview(input: {
  kind: AdminInboxItemKind;
  message: AnyRecord;
  linkedRequest: AnyRecord | null;
  messageText: string;
  projectTitle: string;
  client: { name: string; email: string; phone: string };
}) {
  const { kind, message, linkedRequest, messageText, projectTitle, client } = input;

  if (messageText) return messageText;

  if (kind === "incomplete_message") {
    const missingParts = [
      !getMessageRequestId(message) ? "لا يوجد requestId/parentRequestId" : "",
      !hasValue(projectTitle) || projectTitle === "سجل مشروع غير مكتمل" ? "المشروع غير واضح" : "",
      !hasClientIdentity(client) ? "بيانات العميل غير مكتملة" : "",
    ].filter(Boolean);

    if (missingParts.length > 0) {
      return `سجل الرسالة ناقص: ${missingParts.join("، ")}.`;
    }

    return "هذه الرسالة لا تحمل نصًا واضحًا ولا ترتبط بطلب معروف.";
  }

  const linkedRequestSummary = pickText(
    linkedRequest?.note,
    linkedRequest?.message,
    linkedRequest?.details
  );
  if (linkedRequestSummary) {
    return `متابعة على طلب معروف. ملخص الطلب: ${linkedRequestSummary}`;
  }

  return "عنصر محادثة مرتبط بطلب معروف لكن نص الرسالة غير متوفر في السجل.";
}

function getMissingRequestParts(
  request: AnyRecord,
  projectTitle: string,
  client: { name: string; email: string; phone: string }
) {
  return [
    !getProjectId(request) && (!hasValue(projectTitle) || projectTitle === "سجل مشروع غير مكتمل")
      ? "لا يوجد مشروع مرتبط"
      : "",
    !hasClientIdentity(client) ? "بيانات العميل غير مكتملة" : "",
  ].filter(Boolean);
}

function resolveClientDetails<T extends { id: string } & AnyRecord>(
  primarySource: AnyRecord,
  userIdentityIndex: UserIdentityIndex<T>,
  secondarySource?: AnyRecord | null
) {
  const linkedUser = resolveLinkedUser(primarySource, userIdentityIndex);
  const fallbackSource = secondarySource || primarySource;

  return {
    name:
      getLinkedUserDisplayName(primarySource, userIdentityIndex) ||
      pickText(
        fallbackSource?.name,
        fallbackSource?.investorName,
        fallbackSource?.userSnapshot?.displayName,
        "عميل غير محدد"
      ) ||
      "عميل غير محدد",
    email:
      getLinkedUserEmail(primarySource, userIdentityIndex) ||
      pickText(
        fallbackSource?.email,
        fallbackSource?.investorEmail,
        fallbackSource?.userSnapshot?.email,
        ""
      ),
    phone:
      pickText(
        linkedUser?.phone,
        linkedUser?.mobile,
        linkedUser?.phoneNumber,
        linkedUser?.profile?.phone,
        linkedUser?.contact?.phone,
        primarySource?.phone,
        primarySource?.investorPhone,
        primarySource?.userSnapshot?.phone,
        fallbackSource?.phone,
        fallbackSource?.investorPhone,
        fallbackSource?.userSnapshot?.phone,
        ""
      ),
  };
}

function resolveProjectTitle(input: {
  source: AnyRecord;
  projectId: string | null;
  linkedRequest: AnyRecord | null;
  projectsMap: Record<string, any>;
}) {
  const { source, projectId, linkedRequest, projectsMap } = input;

  return (
    getProjectDisplayTitleById(
      projectsMap,
      projectId,
      linkedRequest?.projectTitle,
      linkedRequest?.projectSnapshot?.titleAr,
      linkedRequest?.projectSnapshot?.title,
      source?.projectTitle,
      source?.projectSnapshot?.titleAr,
      source?.projectSnapshot?.title,
      "سجل مشروع غير مكتمل"
    ) || "سجل مشروع غير مكتمل"
  );
}

function getRequestKind(request: AnyRecord, projectsMap: Record<string, any>): AdminInboxItemKind {
  const normalizedType = String(request.type || request.requestType || "")
    .trim()
    .toLowerCase();
  const projectId = getProjectId(request);
  const projectStatus = String(
    request.projectStatus ||
      request.projectSnapshot?.status ||
      (projectId ? projectsMap[projectId]?.status : "")
  )
    .trim()
    .toLowerCase();
  const amount = toNumberSafe(request.amount || request.requestedAmount || request.estimatedAmount);

  if (
    normalizedType === "launch_interest" ||
    normalizedType === "interest_request" ||
    normalizedType === "prelaunch_interest"
  ) {
    return "interest_request";
  }

  if (!normalizedType && amount <= 0 && ["draft", "upcoming", "comingsoon", "coming_soon"].includes(projectStatus)) {
    return "interest_request";
  }

  return "investment_request";
}

function getRequestId(source: AnyRecord) {
  return pickText(source?.requestId, source?.id) || null;
}

function getMessageRequestId(source: AnyRecord) {
  return pickText(source?.parentRequestId, source?.requestId, source?.parentMessageId) || null;
}

function getProjectId(source: AnyRecord) {
  return pickText(source?.projectId, source?.project_id, source?.project?.id) || null;
}

function getMessageBody(source: AnyRecord) {
  return pickText(source?.message, source?.note, source?.body, source?.description);
}

function normalizeRequestStatus(raw: unknown) {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase();
  const legacyMap: Record<string, string> = {
    new: "pending",
    in_progress: "reviewing",
    pending_review: "reviewing",
    needs_account: "reviewing",
    waiting_client_confirmation: "reviewing",
    resolved: "approved",
    closed: "completed",
  };

  return legacyMap[normalized] || normalized || "pending";
}

function normalizeStageRole(raw: unknown, source: AnyRecord) {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase();

  if (
    [
      "reviewer",
      "review",
      "staff",
      "accountant",
      "client",
      "investment",
      "contract",
      "owner",
      "completed",
    ].includes(normalized)
  ) {
    return normalized;
  }

  const status = normalizeRequestStatus(source?.status);
  if (["completed", "rejected", "closed"].includes(status)) return "completed";
  if (pickText(source?.investmentId, source?.contractId) || status === "approved") {
    return "investment";
  }
  return "review";
}

function resolveUpdatedAt(source: AnyRecord, fallbackDate: Date | null) {
  const lastEventAt =
    Array.isArray(source?.events) && source.events.length
      ? source.events[source.events.length - 1]?.at
      : null;

  return (
    toDateSafe(
      source?.updatedAt ||
        source?.updated_at ||
        source?.lastUpdatedAt ||
        source?.lastActivityAt ||
        source?.lastActionAt ||
        source?.processedAt ||
        lastEventAt
    ) || fallbackDate
  );
}

function buildTrackingState(input: {
  seenAt: Date | null;
  handledAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  adminAction: string | null;
  status: string;
  stage: string;
  source: AnyRecord;
}) {
  const { seenAt, handledAt, createdAt, updatedAt, adminAction, status, stage, source } = input;
  const isHandled = Boolean(handledAt);
  const isSeenCandidate = Boolean(seenAt) && !isHandled;
  const isInProgress =
    isSeenCandidate &&
    (Boolean(pickText(adminAction)) || hasStartedWorkflowStep({ status, stage, source }));
  const isSeen = isSeenCandidate && !isInProgress;
  const trackingStatus: AdminInboxTrackingStatus = isHandled
    ? "handled"
    : isInProgress
      ? "in_progress"
      : isSeen
        ? "seen"
        : "new";
  const actionBaseAt = isInProgress ? updatedAt || seenAt || createdAt : seenAt || createdAt;
  const needsAction =
    Boolean(isSeenCandidate && actionBaseAt) &&
    Date.now() - (actionBaseAt?.getTime() || 0) >= NEEDS_ACTION_AFTER_HOURS * 60 * 60 * 1000;

  return {
    trackingStatus,
    isNew: trackingStatus === "new",
    isSeen,
    isInProgress,
    isHandled,
    needsAction,
  };
}

function hasStartedWorkflowStep(input: {
  status: string;
  stage: string;
  source: AnyRecord;
}) {
  const { status, stage, source } = input;

  if (pickText(source?.investmentId, source?.contractId, source?.allocationId)) {
    return true;
  }

  if (stage && stage !== "review") {
    return true;
  }

  return Boolean(status && !["pending", "completed", "rejected"].includes(status));
}

function getAmountValue(primarySource: AnyRecord, secondarySource?: AnyRecord | null) {
  const amount = toNumberSafe(
    primarySource?.approvedAmount ||
      primarySource?.amount ||
      primarySource?.requestedAmount ||
      primarySource?.estimatedAmount ||
      secondarySource?.approvedAmount ||
      secondarySource?.amount ||
      secondarySource?.requestedAmount ||
      secondarySource?.estimatedAmount
  );

  return amount > 0 ? amount : null;
}

function toNumberSafe(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValue(value: unknown) {
  return Boolean(String(value ?? "").trim());
}

function hasClientIdentity(client: { name: string; email: string; phone: string }) {
  return Boolean(
    [client.name, client.email, client.phone].some(
      (value) => String(value || "").trim() && String(value || "").trim() !== "عميل غير محدد"
    )
  );
}

function buildRequestHref(requestId: string) {
  return `/admin/messages/${encodeURIComponent(requestId)}`;
}

function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof (value as any)?.toDate === "function") return (value as any).toDate();
  if (typeof (value as any)?.seconds === "number") {
    return new Date((value as any).seconds * 1000);
  }
  if (typeof value === "number") return new Date(value);

  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
