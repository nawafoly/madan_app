/* eslint-disable @typescript-eslint/no-unused-vars */
// client/src/pages/admin/MessagesManagement.tsx
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ContractFilePicker from "@/components/ContractFilePicker";
import MessagesDetailView, {
  type DetailSecondaryTabKey,
} from "./messages/MessagesDetailView";
import MessagesListView from "./messages/MessagesListView";
import {
  useMessagesViewModels,
  useMessagesWorkflowDisplayModel,
} from "./messages/useMessagesViewModels";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  runTransaction,
  getDoc,
  arrayUnion,
  query,
  orderBy,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import {
  formatCurrencyEN,
  formatDateTimeEN,
  formatNumberEN,
} from "@/lib/formatters";
import {
  buildProjectsMap,
  getProjectDisplayTitleById,
} from "@/lib/projectDisplay";
import { getProjectComputedAmounts } from "@/lib/projectAmounts";
import {
  buildUserIdentityIndex,
  getLinkedUserEmail,
  resolveLinkedUser,
} from "@/lib/userDisplay";
import { getOwnerRoleLabel, getRoleDisplayLabel } from "@/lib/ownerAccounts";
import { getClientInvestmentStatusMeta } from "@/lib/workflowStatusMeta";
import { resolveInvestmentActivationTerms } from "@shared/investmentActivation";
import { hasPermission, useAuth } from "@/_core/hooks/useAuth";
import {
  AUDIT_ACTIONS,
  auditedUpdateDoc,
  buildAuditSource,
  runAuditedOperation,
} from "@/lib/auditLog";
import {
  buildR2DownloadUrl,
  listDocumentMetadata,
  pickLatestFileByCategory,
  uploadInvestmentDocument,
  type CloudflareFileRecord,
  type UploadDocumentResult,
} from "@/lib/documentUploadService";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  Eye,
  Upload,
  FileText,
  Loader2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CLIENT_WORKFLOW_COPY,
  getClientContractStatusLabel,
} from "@shared/investmentLifecycle";
import {
  buildEarlyStopSettlementPreview,
  getInvestmentSettlementSnapshot,
  INVESTMENT_SETTLEMENT_FILE_CATEGORY,
  isInvestmentStoppedEarly,
  isStopDateBeforePlannedEnd,
} from "@shared/investmentSettlement";
import { useLocation, useRoute } from "wouter";

/* =========================
  ✅ Switch: Disable contracts/files now
  - True = لا عقود + لا رفع + لا signed (ترحيل يدوي)
  - False = يرجع نظام العقود القديم بالكامل
========================= */
const CONTRACTS_DISABLED = false;

const DETAIL_DIALOG_PANEL_CLASS =
  "overflow-x-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,0.985)_14%,rgba(248,250,252,0.98)_100%)] text-slate-950 shadow-[0_32px_90px_-34px_rgba(15,23,42,0.42)]";
const DETAIL_SECTION_CARD_CLASS =
  "overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.94)_100%)] shadow-[0_24px_60px_-42px_rgba(15,23,42,0.28)]";
const DETAIL_SECTION_HEADER_CLASS = "border-b border-slate-200/80 px-6 pb-4 pt-5";
const DETAIL_SECTION_TITLE_CLASS =
  "text-[1.02rem] font-semibold tracking-tight text-slate-950";
const DETAIL_SECTION_CONTENT_CLASS = "space-y-5 px-6 pb-6 pt-5 text-slate-700";
const DETAIL_INLINE_PANEL_CLASS =
  "rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]";
const DETAIL_INLINE_LABEL_CLASS =
  "mb-3 text-[11px] font-semibold tracking-[0.14em] text-slate-400";
const DETAIL_INPUT_ROW_CLASS =
  "grid grid-cols-1 items-start gap-3 rounded-[20px] border border-slate-200/80 bg-slate-50/85 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] md:grid-cols-[120px_1fr] md:gap-4";
const DETAIL_INPUT_LABEL_CLASS =
  "pt-1 text-right text-[11px] font-semibold tracking-[0.14em] text-slate-400";
const DETAIL_INPUT_VALUE_CLASS =
  "break-words text-right text-[15px] font-semibold leading-7 text-slate-950";
const DETAIL_SUBCARD_CLASS =
  "space-y-3 rounded-[22px] border border-slate-200/80 bg-slate-50/75 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]";
const DETAIL_SUBCARD_TITLE_CLASS = "text-sm font-semibold text-slate-950";
const DETAIL_SUBCARD_VALUE_CLASS =
  "break-words text-sm font-medium leading-7 text-slate-700";
const DETAIL_HELP_TEXT_CLASS = "text-sm leading-7 text-slate-500";
const DETAIL_ALERT_CLASS =
  "rounded-[20px] border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,rgba(255,255,255,0.98)_100%)] px-4 py-3.5 text-sm leading-7 text-amber-950";
const DETAIL_PILL_BASE_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border px-3.5 text-xs font-semibold leading-none tracking-[0.01em]";
const DETAIL_COMPACT_PILL_BASE_CLASS =
  "inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[11px] font-semibold leading-none tracking-[0.01em]";
const DETAIL_STAGE_PILL_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-3.5 text-xs font-semibold leading-none tracking-[0.01em] text-slate-700";
const DETAIL_TEXTAREA_CLASS =
  "min-h-[132px] rounded-[20px] border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-950 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.36)] placeholder:text-slate-400";
const DETAIL_BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const DETAIL_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.3)]`;
const TRACKING_MESSAGES_COL = "messages";

type AdminHandledAction =
  | "approve"
  | "reject"
  | "reply"
  | "close"
  | "archive"
  | "mark_done";

/* =========================
  helpers
========================= */

// ✅ safer date (عشان serverTimestamp قبل ما يتحول لـ Timestamp)
const toDateSafe = (v: any) => {
  try {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
};

function formatDateTimeAR(v: any) {
  return formatDateTimeEN(toDateSafe(v));
}

function toDateInputValue(value: Date | null | undefined) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

function formatDetailedDateTime(value: any) {
  const date = value instanceof Date ? value : toDateSafe(value);
  return !date || Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB-u-nu-latn", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function translateSettlementPreviewError(code: string) {
  switch (code) {
    case "missing_start_date":
      return "لا يمكن إيقاف الاستثمار قبل تثبيت تاريخ البداية الفعلي.";
    case "invalid_stop_date":
      return "تاريخ الإيقاف غير صالح.";
    case "stop_before_start":
      return "تاريخ الإيقاف يجب أن يكون بعد تاريخ بداية الاستثمار.";
    case "missing_principal_amount":
      return "قيمة أصل الاستثمار غير متوفرة للحساب.";
    case "missing_profit_rate":
      return "نسبة الربح المعتمدة غير متوفرة للحساب.";
    default:
      return "تعذر تجهيز معاينة التسوية النهائية.";
  }
}

function formatRequestTimeLabel(value: any) {
  const date = toDateSafe(value);
  if (!date) return "—";

  const diffMs = Date.now() - date.getTime();
  const absMs = Math.abs(diffMs);

  if (absMs < 60 * 1000) return "الآن";

  if (absMs < 6 * 60 * 60 * 1000) {
    const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });

    if (absMs < 60 * 60 * 1000) {
      return rtf.format(
        -Math.max(1, Math.round(absMs / (60 * 1000))),
        "minute"
      );
    }

    return rtf.format(
      -Math.max(1, Math.round(absMs / (60 * 60 * 1000))),
      "hour"
    );
  }

  return new Intl.DateTimeFormat("ar-SA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatRequestDateLabel(value: any) {
  const date = toDateSafe(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

const pick = (...vals: any[]) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== "undefined" && s !== "null") return s;
  }
  return "";
};

const buildHandledTrackingPatch = (action: AdminHandledAction) => ({
  adminHandledAt: serverTimestamp(),
  adminAction: action,
});

const buildHandledTrackingResetPatch = () => ({
  adminHandledAt: deleteField(),
  adminAction: deleteField(),
});

async function syncRelatedMessageTracking(
  requestId: string,
  action: AdminHandledAction | null
) {
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedRequestId) return;

  try {
    const messagesRef = collection(db, TRACKING_MESSAGES_COL);
    const [requestMatches, parentRequestMatches, parentMessageMatches] =
      await Promise.all([
        getDocs(query(messagesRef, where("requestId", "==", normalizedRequestId))),
        getDocs(
          query(messagesRef, where("parentRequestId", "==", normalizedRequestId))
        ),
        getDocs(
          query(messagesRef, where("parentMessageId", "==", normalizedRequestId))
        ),
      ]);

    const relatedDocs = new Map<string, any>();
    [requestMatches, parentRequestMatches, parentMessageMatches].forEach(
      (snapshot) => {
        snapshot.docs.forEach((row) => {
          relatedDocs.set(row.id, row);
        });
      }
    );

    if (!relatedDocs.size) return;

    const batch = writeBatch(db);
    relatedDocs.forEach((row) => {
      if (action) {
        batch.set(
          row.ref,
          {
            adminReadAt: serverTimestamp(),
            adminHandledAt: serverTimestamp(),
            adminAction: action,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        return;
      }

      batch.update(row.ref, {
        adminHandledAt: deleteField(),
        adminAction: deleteField(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  } catch (error) {
    console.error("Failed to sync linked message tracking state", {
      requestId: normalizedRequestId,
      action,
      error,
    });
  }
}

const pickFirstNonEmptyString = (...vals: any[]) => {
  for (const v of vals) {
    const s = String(v || "").trim();
    if (s && s !== "undefined" && s !== "null") return s;
  }
  return "";
};

function readNestedValue(source: any, path: string) {
  const keys = String(path || "")
    .split(".")
    .map(v => v.trim())
    .filter(Boolean);
  let current = source;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function resolveDocPath(source: any, candidates: string[]) {
  for (const candidate of candidates) {
    const value = pickFirstNonEmptyString(readNestedValue(source, candidate));
    if (value) return value;
  }
  return "";
}

function resolveDocValue(source: any, candidates: string[]) {
  for (const candidate of candidates) {
    const value = readNestedValue(source, candidate);
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return undefined;
}

const getClientName = (m: any) =>
  pick(
    m?.name,
    m?.fullName,
    m?.full_name,
    m?.clientName,
    m?.customerName,
    m?.contactName,
    m?.contact?.name,
    m?.profile?.name,
    m?.investorName,
    m?.userSnapshot?.displayName
  );

const getClientEmail = (m: any) =>
  pick(
    m?.email,
    m?.contactEmail,
    m?.clientEmail,
    m?.userEmail,
    m?.contact?.email,
    m?.profile?.email,
    m?.investorEmail,
    m?.userSnapshot?.email
  );

const getClientPhone = (m: any) =>
  pick(
    m?.phone,
    m?.mobile,
    m?.phoneNumber,
    m?.contactPhone,
    m?.clientPhone,
    m?.contact?.phone,
    m?.profile?.phone,
    m?.investorPhone,
    m?.userSnapshot?.phone
  );

const getLinkedClientName = (linkedUser: any) =>
  pick(
    linkedUser?.displayName,
    linkedUser?.fullName,
    linkedUser?.full_name,
    linkedUser?.name,
    linkedUser?.profile?.name,
    linkedUser?.profile?.displayName,
    linkedUser?.contact?.name
  );

const getIndexedUserName = (user: any) =>
  pick(
    user?.displayName,
    user?.fullName,
    user?.full_name,
    user?.name,
    user?.profile?.name,
    user?.profile?.displayName,
    user?.contact?.name
  );

function resolveLastActorMeta(
  source: any,
  userIdentityIndex: any,
  client: ReturnType<typeof resolveRequestClient>
) {
  const lastEvent =
    Array.isArray(source?.events) && source.events.length
      ? source.events[source.events.length - 1]
      : null;

  const actorUid = pick(
    lastEvent?.byUid,
    source?.updatedByUid,
    source?.actionByUid,
    source?.processedByUid
  );
  const actorEmail = pick(
    lastEvent?.byEmail,
    source?.updatedByEmail,
    source?.actionByEmail,
    source?.processedByEmail
  )
    .trim()
    .toLowerCase();
  const actorRole = pick(
    lastEvent?.byRole,
    source?.actionByRole,
    source?.updatedByRole,
    source?.processedByRole
  );
  const actorAt =
    toDateSafe(lastEvent?.at) ||
    toDateSafe(source?.updatedAt) ||
    toDateSafe(source?.lastActivityAt) ||
    toDateSafe(source?.processedAt) ||
    toDateSafe(source?.createdAt);

  const linkedActor =
    (actorUid && userIdentityIndex?.byId?.[actorUid]) ||
    (actorEmail && userIdentityIndex?.byEmail?.[actorEmail]) ||
    null;

  const actorMatchesClient =
    (actorUid && actorUid === client.clientId) ||
    (actorEmail &&
      client.clientEmail &&
      actorEmail === String(client.clientEmail || "").trim().toLowerCase()) ||
    normalizeRole(actorRole) === "client";

  const actorName =
    getIndexedUserName(linkedActor) ||
    (actorMatchesClient ? client.clientName : "") ||
    "لم يتم تحديد آخر معدّل";
  const resolvedRole =
    pick(
      linkedActor?.role,
      linkedActor?.userRole,
      linkedActor?.profile?.role,
      actorRole
    ) ||
    (actorMatchesClient ? "client" : "");

  return {
    name: actorName,
    roleLabel: getRoleDisplayLabel(resolvedRole) || "منصب غير محدد",
    relativeTimeLabel: actorAt ? `عدّل ${formatRequestTimeLabel(actorAt)}` : "الوقت غير متاح",
    dateLabel: formatRequestDateLabel(actorAt),
  };
}

function resolveActivityActorMeta(
  source: any,
  userIdentityIndex: any,
  client: ReturnType<typeof resolveRequestClient>
) {
  const actorUid = pick(source?.byUid, source?.actionByUid, source?.processedByUid);
  const actorEmail = String(
    pick(source?.byEmail, source?.actionByEmail, source?.processedByEmail)
  )
    .trim()
    .toLowerCase();
  const actorRole = pick(source?.byRole, source?.actionByRole, source?.processedByRole);
  const linkedActor =
    (actorUid && userIdentityIndex?.byId?.[actorUid]) ||
    (actorEmail && userIdentityIndex?.byEmail?.[actorEmail]) ||
    null;

  const actorMatchesClient =
    (actorUid && actorUid === client.clientId) ||
    (actorEmail &&
      client.clientEmail &&
      actorEmail === String(client.clientEmail || "").trim().toLowerCase()) ||
    normalizeRole(actorRole) === "client";

  const resolvedRole =
    pick(
      linkedActor?.role,
      linkedActor?.userRole,
      linkedActor?.profile?.role,
      actorRole
    ) || (actorMatchesClient ? "client" : "");
  const actorName =
    getIndexedUserName(linkedActor) ||
    (actorMatchesClient ? client.clientName : "") ||
    getRoleDisplayLabel(resolvedRole) ||
    actorEmail ||
    actorUid ||
    "مستخدم النظام";

  return {
    name: actorName,
    roleLabel: getRoleDisplayLabel(resolvedRole) || "دون توصيف",
    secondaryLabel: actorEmail || actorUid || "",
  };
}

function buildRequestTimelineEvents(input: {
  request: any;
  userIdentityIndex: any;
  client: ReturnType<typeof resolveRequestClient>;
  requestKind: RequestKindKey;
}) {
  const { request, userIdentityIndex, client, requestKind } = input;
  const requestSummary = getRequestSummary(request);
  const requestCreatedAt = toDateSafe(
    request?.createdAt ||
    request?.created_at ||
    request?.submittedAt ||
    request?.timestamp
  );

  const baseEvents = Array.isArray(request?.events) ? request.events : [];
  const hasCreatedEvent = baseEvents.some((event: TimelineEvent) =>
    ["request_created", "request_submitted"].includes(String(event?.type || ""))
  );

  const timelineSource = [...baseEvents];
  if (requestCreatedAt && !hasCreatedEvent) {
    timelineSource.push({
      type: "request_created",
      title:
        requestKind === "interest"
          ? "تم استلام طلب الاهتمام"
          : "تم استلام طلب الاستثمار",
      note: requestSummary || null,
      byUid: pick(
        request?.createdByUid,
        request?.investorUid,
        request?.userId,
        request?.userSnapshot?.uid
      ),
      byEmail: pick(
        request?.email,
        request?.investorEmail,
        request?.userSnapshot?.email
      ),
      byRole: pick(request?.userSnapshot?.role, request?.role, "client"),
      at: requestCreatedAt,
    });
  }

  return timelineSource
    .map((event, index) => {
      const atValue = toDateSafe(event?.at);
      return {
        id: `${String(event?.type || "activity")}-${index}`,
        title: String(event?.title || "تم تحديث الطلب").trim() || "تم تحديث الطلب",
        note:
          typeof event?.note === "string" && event.note.trim()
            ? event.note.trim()
            : null,
        atValue,
        atLabel: formatDateTimeAR(atValue),
        timeLabel: formatRequestTimeLabel(atValue),
        actor: resolveActivityActorMeta(event, userIdentityIndex, client),
      };
    })
    .sort((a, b) => {
      const aTime = a.atValue instanceof Date ? a.atValue.getTime() : 0;
      const bTime = b.atValue instanceof Date ? b.atValue.getTime() : 0;
      return bTime - aTime;
    });
}

function resolveRequestClient(source: any, userIdentityIndex: any) {
  const linkedUser = resolveLinkedUser(source, userIdentityIndex);
  const requestName = getClientName(source);
  const requestEmail = getClientEmail(source);
  const requestPhone = getClientPhone(source);
  const requestRole = pick(
    linkedUser?.role,
    linkedUser?.userRole,
    linkedUser?.profile?.role,
    source?.role,
    source?.userRole,
    source?.userSnapshot?.role,
    source?.profile?.role
  );
  const liveName = linkedUser ? getLinkedClientName(linkedUser) : "";
  const liveEmail = linkedUser
    ? getLinkedUserEmail(source, userIdentityIndex, requestEmail)
    : "";
  const livePhone = pick(
    linkedUser?.phone,
    linkedUser?.mobile,
    linkedUser?.phoneNumber,
    linkedUser?.profile?.phone,
    linkedUser?.contact?.phone
  );
  const sourceKey =
    linkedUser != null
      ? "live_user"
      : requestName || requestEmail || requestPhone
        ? "request_snapshot"
        : "unknown";
  const sourceMeta =
    sourceKey === "live_user"
      ? {
        label: "ملف المستخدم الحالي",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
        helper: "الاسم والبريد معروضان مباشرة من users في Firestore.",
      }
      : sourceKey === "request_snapshot"
        ? {
          label: "بيانات الطلب",
          tone: "border-amber-200 bg-amber-50 text-amber-700",
          helper:
            "تعذر ربط الطلب بملف عميل حالي، لذلك يتم العرض من البيانات المحفوظة داخل الطلب نفسه.",
        }
        : {
          label: "بيانات غير مكتملة",
          tone: "border-slate-200 bg-slate-100 text-slate-600",
          helper: "لا توجد بيانات كافية لربط الطلب بملف عميل حالي.",
        };

  return {
    linkedUser,
    clientId: pick(
      linkedUser?.id,
      linkedUser?.uid,
      source?.createdByUid,
      source?.investorUid,
      source?.userId,
      source?.userSnapshot?.uid
    ),
    clientName:
      sourceKey === "live_user"
        ? liveName || requestName || "مستخدم غير معروف"
        : requestName || "مستخدم غير معروف",
    clientEmail:
      sourceKey === "live_user" ? liveEmail || requestEmail : requestEmail,
    clientPhone:
      sourceKey === "live_user" ? livePhone || requestPhone : requestPhone,
    clientRole: requestRole,
    clientRoleLabel:
      getRoleDisplayLabel(requestRole) ||
      (sourceKey === "live_user" ? "عميل" : "مستخدم"),
    sourceKey,
    sourceLabel: sourceMeta.label,
    sourceTone: sourceMeta.tone,
    sourceHelper: sourceMeta.helper,
  };
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toPositiveInt(v: any) {
  const n = toNum(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function toBooleanSafe(v: any) {
  if (v === true) return true;
  if (v === false) return false;
  const raw = String(v || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function moneySAR(v: any) {
  return formatCurrencyEN(toNum(v));
}

function stageLabel(v: any) {
  const s = String(v || "");
  const map: Record<string, string> = {
    reviewer: "مراجع",
    review: "مراجعة",
    staff: "مراجع",
    accountant: "محاسب",
    client: "العميل",
    investment: "الاستثمار",
    contract: "العقد",
    owner: getOwnerRoleLabel(),
    completed: "مقفل",
  };
  return map[s] || (s ? s : "—");
}

function normalizeRequestStatus(raw: any): MessageStatus {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  const legacyMap: Record<string, MessageStatus> = {
    new: "pending",
    in_progress: "reviewing",
    pending_review: "reviewing",
    needs_account: "reviewing",
    waiting_client_confirmation: "reviewing",
    resolved: "approved",
    closed: "completed",
  };
  if (legacyMap[s]) return legacyMap[s];
  if (
    [
      "pending",
      "reviewing",
      "approved",
      "completed",
      "rejected",
      "no_account",
      "closed",
    ].includes(s)
  ) {
    return s as MessageStatus;
  }
  return "pending";
}

function normalizeStageRole(
  raw: any,
  status: MessageStatus,
  hasInvestment: boolean
): StageRole {
  const s = String(raw || "")
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
    ].includes(s)
  ) {
    return s as StageRole;
  }
  if (status === "completed" || status === "rejected" || status === "closed")
    return "completed";
  if (hasInvestment || status === "approved") return "investment";
  return "review";
}

function requestNumber(m: any) {
  return (
    pick(m?.issueNumber, m?.requestNumber, m?.mk) ||
    (m?.id ? String(m.id).slice(0, 8) : "—")
  );
}

function lastTouchedBy(m: any) {
  // ✅ أفضلية: آخر تحديث محفوظ
  const v = pick(
    m?.updatedByEmail,
    m?.updatedByUid,
    m?.processedByName,
    m?.processedByUid
  );
  if (v) return v;

  // ✅ fallback: آخر حدث
  if (Array.isArray(m?.events) && m.events.length) {
    const last = m.events[m.events.length - 1];
    return pick(last?.byEmail, last?.byUid, last?.byRole) || "—";
  }

  return "—";
}

function getLastUpdatedAtValue(m: any) {
  const lastEventAt =
    Array.isArray(m?.events) && m.events.length
      ? m.events[m.events.length - 1]?.at
      : null;

  return (
    toDateSafe(
      m?.updatedAt ||
      m?.updated_at ||
      m?.lastUpdatedAt ||
      m?.lastActivityAt ||
      m?.processedAt ||
      lastEventAt
    ) ||
    toDateSafe(m?.createdAt || m?.created_at || m?.submittedAt || m?.timestamp)
  );
}

function formatLastUpdatedAt(m: any) {
  return formatDateTimeEN(getLastUpdatedAtValue(m));
}

function normalizeSearchValue(...values: any[]) {
  return values
    .map(value =>
      String(value ?? "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
    .join(" ");
}

function getRequestSummary(m: any) {
  const candidates = [
    m?.message,
    m?.body,
    m?.description,
    m?.details,
    m?.note,
    m?.requestText,
    m?.reason,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function getFileNameFromPath(path: any): string {
  const p = String(path || "").trim();
  if (!p) return "-";
  const normalized = p.replace(/\\/g, "/");
  const last = normalized.split("/").pop();
  return String(last || "-").trim() || "-";
}

function expectedContractPath(
  investmentId: string,
  kind: "original" | "signed"
) {
  const id = String(investmentId || "").trim();
  if (!id) return "";
  return kind === "original"
    ? `investments/${id}/contracts/original.pdf`
    : `investments/${id}/contracts/signed.pdf`;
}

type R2ProbeStatus = "exists" | "missing" | "unknown";

async function r2ObjectStatus(path: string): Promise<R2ProbeStatus> {
  const rawUrl = buildR2DownloadUrl(path, false);
  if (!rawUrl) return "unknown";
  try {
    const probeUrl = new URL(rawUrl);
    probeUrl.searchParams.set("probe", "1");
    const response = await fetch(probeUrl.toString(), { method: "GET" });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload && typeof payload.exists === "boolean") {
      return payload.exists ? "exists" : "missing";
    }
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    if (response.ok) return "exists";
    if (response.status === 404) return "missing";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function getContractStatusLabel(status: any): string {
  return getClientContractStatusLabel(status);
}

function getContractStatusClass(status: any): string {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  const map: Record<string, string> = {
    draft: "border-slate-200 bg-slate-100 text-slate-700",
    sent: "border-sky-200 bg-sky-50 text-sky-800",
    pending_signature: "border-amber-200 bg-amber-50 text-amber-800",
    signed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    issued: "border-sky-200 bg-sky-50 text-sky-800",
    signed_uploaded: "border-emerald-200 bg-emerald-50 text-emerald-800",
    under_review: "border-violet-200 bg-violet-50 text-violet-800",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return map[s] || "border-slate-200 bg-slate-100 text-slate-700";
}

function getDetailRequestStatusClass(status: any): string {
  const normalizedStatus = normalizeRequestStatus(status);
  const map: Record<string, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    reviewing: "border-sky-200 bg-sky-50 text-sky-800",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
    completed: "border-slate-200 bg-slate-100 text-slate-800",
    rejected: "border-rose-200 bg-rose-50 text-rose-800",
    no_account: "border-rose-200 bg-rose-50 text-rose-800",
    closed: "border-slate-200 bg-slate-100 text-slate-800",
  };

  return cn(
    DETAIL_PILL_BASE_CLASS,
    map[normalizedStatus] || "border-slate-200 bg-slate-100 text-slate-700"
  );
}

function getDetailBinaryPillClass(active: boolean): string {
  return cn(
    DETAIL_COMPACT_PILL_BASE_CLASS,
    active
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-slate-200 bg-slate-100 text-slate-600"
  );
}

type StageRole =
  | "reviewer"
  | "review"
  | "staff"
  | "accountant"
  | "client"
  | "investment"
  | "contract"
  | "owner"
  | "completed";

type MessageStatus =
  | "pending"
  | "reviewing"
  | "approved"
  | "new"
  | "in_progress"
  | "needs_account"
  | "waiting_client_confirmation"
  | "resolved"
  | "completed"
  | "rejected"
  | "no_account"
  | "closed";

function getRequestStatusMeta(status: any) {
  const normalizedStatus = normalizeRequestStatus(status);
  const approvedMeta = getClientInvestmentStatusMeta("approved");

  const map: Record<
    MessageStatus,
    { label: string; tone: string; accent: string }
  > = {
    pending: {
      label: "قيد الانتظار",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      accent: "bg-amber-500",
    },
    reviewing: {
      label: "قيد المراجعة",
      tone: "border-sky-200 bg-sky-50 text-sky-800",
      accent: "bg-sky-500",
    },
    approved: {
      label: approvedMeta.label,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      accent: "bg-emerald-500",
    },
    new: {
      label: "قيد الانتظار",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      accent: "bg-amber-500",
    },
    in_progress: {
      label: "قيد المراجعة",
      tone: "border-sky-200 bg-sky-50 text-sky-800",
      accent: "bg-sky-500",
    },
    needs_account: {
      label: "قيد المراجعة",
      tone: "border-sky-200 bg-sky-50 text-sky-800",
      accent: "bg-sky-500",
    },
    waiting_client_confirmation: {
      label: "قيد المراجعة",
      tone: "border-sky-200 bg-sky-50 text-sky-800",
      accent: "bg-sky-500",
    },
    resolved: {
      label: approvedMeta.label,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      accent: "bg-emerald-500",
    },
    completed: {
      label: "مكتمل",
      tone: "border-slate-200 bg-slate-100 text-slate-800",
      accent: "bg-slate-500",
    },
    rejected: {
      label: "مرفوض",
      tone: "border-rose-200 bg-rose-50 text-rose-800",
      accent: "bg-rose-500",
    },
    no_account: {
      label: "بدون حساب",
      tone: "border-rose-200 bg-rose-50 text-rose-800",
      accent: "bg-rose-500",
    },
    closed: {
      label: "مغلق",
      tone: "border-slate-200 bg-slate-100 text-slate-800",
      accent: "bg-slate-500",
    },
  };

  return map[normalizedStatus] || map.pending;
}

function getRequestCardStatusClass(status: any) {
  const normalizedStatus = normalizeRequestStatus(status);
  const map: Record<MessageStatus, string> = {
    pending:
      "border-amber-300/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    reviewing:
      "border-sky-300/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    approved:
      "border-emerald-300/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    new:
      "border-amber-300/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    in_progress:
      "border-sky-300/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    needs_account:
      "border-sky-300/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    waiting_client_confirmation:
      "border-sky-300/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    resolved:
      "border-emerald-300/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    completed:
      "border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,#ffffff_44%,#ffffff_100%)]",
    rejected:
      "border-rose-300/80 bg-[linear-gradient(180deg,rgba(255,241,242,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    no_account:
      "border-rose-300/80 bg-[linear-gradient(180deg,rgba(255,241,242,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    closed:
      "border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,#ffffff_44%,#ffffff_100%)]",
  };

  return map[normalizedStatus] || map.pending;
}

function getRequestStageMeta(stageRole: any) {
  return {
    label: stageLabel(stageRole),
    tone: "border-slate-200 bg-slate-100 text-slate-700",
  };
}

type RequestKindKey = "investment" | "interest";

function normalizeProjectLifecycleForRequest(status: any) {
  const value = String(status || "")
    .trim()
    .toLowerCase();

  if (["draft", "upcoming", "comingsoon", "coming_soon"].includes(value)) {
    return "upcoming";
  }
  if (["published", "active", "available", "open"].includes(value)) {
    return "active";
  }
  if (["closed", "completed", "done"].includes(value)) {
    return "closed";
  }
  return "";
}

function getRequestKindMeta(input: {
  type?: any;
  source?: any;
  projectStatus?: any;
  amount?: number;
}) {
  const normalizedType = String(input.type || "")
    .trim()
    .toLowerCase();
  const normalizedSource = String(input.source || "")
    .trim()
    .toLowerCase();
  const projectLifecycle = normalizeProjectLifecycleForRequest(
    input.projectStatus
  );

  const isInterest =
    normalizedType === "launch_interest" ||
    normalizedType === "interest_request" ||
    normalizedType === "prelaunch_interest" ||
    normalizedSource.includes("prelaunch") ||
    projectLifecycle === "upcoming";

  const key: RequestKindKey = isInterest ? "interest" : "investment";

  if (key === "interest") {
    return {
      key,
      label: "طلب اهتمام",
      shortLabel: "اهتمام",
      badgeTone: "border-amber-200 bg-amber-50 text-amber-800",
      accent: "bg-[linear-gradient(90deg,#f2ae30_0%,#f8c862_55%,#cbd5e1_100%)]",
      cardClass:
        "border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]",
      projectPanelClass: "border-slate-200/80 bg-slate-50/80",
      helperClass:
        "border border-amber-200/80 bg-amber-50/70 text-amber-900",
      helperText:
        "إشارة متابعة غير ملزمة لمشروع قادم، وتحتاج متابعة إطلاق أكثر من قرار مالي فوري.",
      metricLabel: "النوع",
      metricValue: "اهتمام غير ملزم",
      ctaClass:
        "border border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50",
      ctaLabel: "مراجعة الاهتمام",
    };
  }

  return {
    key,
    label: "طلب استثمار",
    shortLabel: "استثمار",
    badgeTone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    accent: "bg-[linear-gradient(90deg,#0f172a_0%,#0f766e_100%)]",
    cardClass:
      "border-emerald-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]",
    projectPanelClass: "border-emerald-200/70 bg-emerald-50/45",
    helperClass:
      "border border-emerald-200/80 bg-emerald-50/80 text-emerald-900",
    helperText:
      "طلب مالي فعلي يحتاج مراجعة أسرع وإبرازًا أوضح للمبلغ والمرحلة الحالية.",
    metricLabel: "المبلغ",
    metricValue: null,
    ctaClass:
      "bg-slate-950 text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)] hover:bg-slate-900",
    ctaLabel: "مراجعة الطلب المالي",
  };
}

type InterestReviewState = "new" | "seen";

function getInterestReviewMeta(request: any) {
  const reviewState: InterestReviewState = request?.adminSeenAt ? "seen" : "new";

  if (reviewState === "seen") {
    return {
      key: reviewState,
      label: "تم الاطلاع",
      tone: "border-slate-200 bg-slate-100 text-slate-700",
      accent: "bg-slate-500",
      cardClass:
        "border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,#ffffff_44%,#ffffff_100%)]",
      helperText:
        "تم تسجيل هذا الاهتمام كمطّلع عليه ونقله تلقائيًا إلى السجل القديم.",
    };
  }

  return {
    key: reviewState,
    label: "جديد",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    accent: "bg-amber-500",
    cardClass:
      "border-amber-300/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    helperText:
      "هذا اهتمام جديد بانتظار الاطلاع الأول فقط، بدون دورة إجراءات استثمارية.",
  };
}

const REQUEST_TRACKING_SLA_HOURS = 24;
const REQUEST_TRACKING_CRITICAL_HOURS = 48;

type RequestTrackingState = "new" | "seen" | "handled" | "needsAction";

function getRequestTrackingStartedAt(request: any) {
  return (
    toDateSafe(request?.adminSeenAt) ||
    getLastUpdatedAtValue(request) ||
    toDateSafe(
      request?.createdAt ||
      request?.created_at ||
      request?.submittedAt ||
      request?.timestamp
    )
  );
}

function getRequestTrackingState(
  request: any,
  requestKindKey?: string
): RequestTrackingState {
  const normalizedStatus = normalizeRequestStatus(request?.status);
  if (
    request?.adminHandledAt ||
    ["completed", "closed", "rejected"].includes(normalizedStatus)
  ) {
    return "handled";
  }
  if (!request?.adminSeenAt) return "new";

  if (requestKindKey === "interest") {
    return "seen";
  }

  const seenAt = toDateSafe(request?.adminSeenAt);
  if (seenAt instanceof Date) {
    const ageHours = (Date.now() - seenAt.getTime()) / (60 * 60 * 1000);
    if (ageHours >= REQUEST_TRACKING_SLA_HOURS) {
      return "needsAction";
    }
  }

  return "seen";
}

function getRequestTrackingMeta(request: any, requestKindKey?: string) {
  const trackingState = getRequestTrackingState(request, requestKindKey);

  switch (trackingState) {
    case "handled":
      return {
        key: trackingState,
        label: "تم التعامل",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
        accent: "bg-emerald-500",
      };
    case "needsAction":
      return {
        key: trackingState,
        label: "يحتاج إجراء",
        tone: "border-rose-200 bg-rose-50 text-rose-800",
        accent: "bg-rose-500",
      };
    case "seen":
      return {
        key: trackingState,
        label: "تم الاطلاع",
        tone: "border-slate-200 bg-slate-100 text-slate-700",
        accent: "bg-slate-500",
      };
    default:
      return {
        key: "new" as const,
        label: "جديد",
        tone: "border-amber-200 bg-amber-50 text-amber-800",
        accent: "bg-amber-500",
      };
  }
}

function getRequestTrackingSlaMeta(request: any, requestKindKey?: string) {
  if (getRequestTrackingState(request, requestKindKey) !== "needsAction") {
    return null;
  }

  const startedAt = getRequestTrackingStartedAt(request);
  if (!(startedAt instanceof Date)) return null;

  const ageHours = (Date.now() - startedAt.getTime()) / (60 * 60 * 1000);
  if (ageHours >= REQUEST_TRACKING_CRITICAL_HOURS) {
    return {
      label: "متأخر جدًا",
      className: "border-rose-300 bg-rose-100 text-rose-900",
    };
  }

  if (ageHours >= REQUEST_TRACKING_SLA_HOURS) {
    return {
      label: "متأخر",
      className: "border-amber-300 bg-amber-100 text-amber-900",
    };
  }

  return null;
}

function getRequestTrackingPriority(request: any, requestKindKey?: string) {
  const rankMap: Record<RequestTrackingState, number> = {
    needsAction: 0,
    new: 1,
    seen: 2,
    handled: 3,
  };

  return rankMap[getRequestTrackingState(request, requestKindKey)];
}

function getInterestTrackingMeta(request: any) {
  const trackingMeta = getRequestTrackingMeta(request, "interest");

  if (trackingMeta.key === "handled") {
    return {
      ...trackingMeta,
      cardClass:
        "border-emerald-300/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
      helperText:
        "تم التعامل مع طلب الاهتمام على مستوى المتابعة الإدارية، ويمكن الرجوع إليه من السجل عند الحاجة.",
    };
  }

  if (trackingMeta.key === "seen") {
    return {
      ...trackingMeta,
      cardClass:
        "border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,#ffffff_44%,#ffffff_100%)]",
      helperText:
        "تم تسجيل الاطلاع على طلب الاهتمام، ويمكن متابعة العميل أو المشروع لاحقًا عند الحاجة.",
    };
  }

  return {
    ...trackingMeta,
    cardClass:
      "border-amber-300/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,#ffffff_42%,#ffffff_100%)]",
    helperText:
      "هذا طلب اهتمام جديد بانتظار الاطلاع الأول فقط، بدون دورة إجراءات استثمارية كاملة.",
  };
}

function isArchivedRequestRecord(request: any) {
  const normalizedStatus = normalizeRequestStatus(request?.status);
  if (normalizedStatus === "completed" || normalizedStatus === "rejected") {
    return true;
  }

  return request?.requestKind?.key === "interest" && Boolean(request?.adminSeenAt);
}

function isNewRequestRecord(request: any) {
  return !isArchivedRequestRecord(request);
}

function isContactMessageRecord(record: any) {
  const type = String(record?.type || "").trim().toLowerCase();
  const requestType = String(record?.requestType || "").trim().toLowerCase();
  const source = String(record?.source || "").trim().toLowerCase();
  return (
    requestType === "contact_message" ||
    type === "contact_message" ||
    source === "site_contact_form"
  );
}

const LIST_VIEW_MODEL_HELPERS = {
  resolveRequestClient,
  pick,
  toNum,
  getRequestStatusMeta,
  getRequestStageMeta,
  getRequestKindMeta,
  getRequestTrackingMeta,
  getRequestTrackingSlaMeta,
  getRequestTrackingPriority,
  getInterestTrackingMeta,
  toDateSafe,
  getLastUpdatedAtValue,
  requestNumber,
  formatDateTimeAR,
  formatRequestTimeLabel,
  lastTouchedBy,
  resolveLastActorMeta,
  getRequestCardStatusClass,
  getRequestSummary,
  getClientEmail,
  getClientPhone,
  normalizeSearchValue,
  isNewRequestRecord,
  isArchivedRequestRecord,
  normalizeRequestStatus,
  buildRequestTimelineEvents,
};

type ContractFileKind = "draft_pdf" | "signed_pdf" | "other";

type ContractFile = {
  kind: ContractFileKind;
  name: string;
  url: string;
  uploadedAt?: any;
};

type ContractDoc = {
  id: string;
  status?:
  | "draft"
  | "sent"
  | "pending_signature"
  | "signed"
  | "under_review"
  | "approved"
  | "returned";
  files?: ContractFile[];
  createdAt?: any;
  updatedAt?: any;
  originalContract?: { path?: string; fileName?: string; url?: string };
  contractFile?: { path?: string; fileName?: string; url?: string };
  signedContract?: { path?: string; fileName?: string; url?: string };
  signedContractFile?: { path?: string; fileName?: string; url?: string };
};

type TimelineEvent = {
  type: string;
  title: string;
  note?: string | null;
  byRole?: string | null;
  byUid?: string | null;
  byEmail?: string | null;
  at?: any;
  meta?: any;
};

/* =========================
  Timeline helpers
========================= */

const myActor = (user?: any, myRole?: string) => {
  return {
    byRole: myRole || null,
    byUid: user?.uid || null,
    byEmail: user?.email || null,
  };
};

const actionMeta = (user?: any, myRole?: string) => {
  return {
    actionByRole: myRole || null,
    actionByUid: user?.uid || null,
    actionByEmail: user?.email || null,
  };
};

const makeEvent = (opts: {
  type: string;
  title: string;
  note?: string | null;
  byRole?: string | null;
  byUid?: string | null;
  byEmail?: string | null;
  meta?: any;
}) => {
  return {
    type: opts.type,
    title: opts.title,
    note: opts.note || null,
    byRole: opts.byRole || null,
    byUid: opts.byUid || null,
    byEmail: opts.byEmail || null,
    at: Timestamp.now(),
    meta: opts.meta || {},
  };
};

/* =========================
  ✅ Roles (Safe + Backward compatible)
========================= */
type AppRole =
  | "owner"
  | "admin"
  | "accountant"
  | "hr"
  | "staff"
  | "client"
  | "guest";

function normalizeRole(raw: any): AppRole {
  if (!raw) return "guest";
  const r = String(raw).toLowerCase();

  if (r.includes("owner")) return "owner";
  if (r.includes("admin")) return "admin";
  if (r.includes("account")) return "accountant";
  if (
    r === "hr" ||
    r.includes("human resources") ||
    r.includes("human_resources") ||
    r.includes("human-resources")
  ) {
    return "hr";
  }
  if (r.includes("staff") || r.includes("reception")) return "staff";
  if (r.includes("client") || r.includes("investor")) return "client";
  if (r.includes("guest")) return "guest";

  return "guest";
}

/* =========================
  Main
========================= */
export default function MessagesManagement() {
  const REQUESTS_COL = "interest_requests"; // ✅ مصدر الحقيقة

  const messagesAuditSource = (method: string) =>
    buildAuditSource({
      area: "admin",
      page: "Messages",
      method,
    });

  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedMessage, setSelectedMessage] = useState<any>(null);

  const [internalNotes, setInternalNotes] = useState("");
  const [detailSecondaryTab, setDetailSecondaryTab] =
    useState<DetailSecondaryTabKey>("context");
  const workflowAutoNavigationRef = useRef<string | null>(null);

  const [approvedAmount, setApprovedAmount] = useState<string>("");

  const [contractBusy, setContractBusy] = useState(false);
  const [approveCreateBusy, setApproveCreateBusy] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);

  // ✅ ملفات/عقد
  const [contractDoc, setContractDoc] = useState<ContractDoc | null>(null);
  const [investmentDoc, setInvestmentDoc] = useState<any>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [localUploadedByKind, setLocalUploadedByKind] = useState<
    Partial<Record<"original" | "signed", UploadDocumentResult>>
  >({});
  const [r2DetectedPathByKind, setR2DetectedPathByKind] = useState<
    Partial<Record<"original" | "signed", string>>
  >({});
  const [r2ProbeStatusByKind, setR2ProbeStatusByKind] = useState<
    Partial<Record<"original" | "signed", R2ProbeStatus>>
  >({});

  // ✅ إرجاع مع ملاحظة
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [stopInvestmentDialogOpen, setStopInvestmentDialogOpen] =
    useState(false);
  const [stopCloseDate, setStopCloseDate] = useState<string>(() =>
    toDateInputValue(new Date())
  );
  const [stopReason, setStopReason] = useState("");
  const [settlementDocumentFile, setSettlementDocumentFile] =
    useState<File | null>(null);
  const [settlementDocuments, setSettlementDocuments] = useState<
    CloudflareFileRecord[]
  >([]);
  const [settlementDocumentsLoading, setSettlementDocumentsLoading] =
    useState(false);
  const [settlementDocumentBusy, setSettlementDocumentBusy] = useState(false);

  const [view, setView] = useState<
    "all" | "new" | "archived" | "open" | "completed" | "rejected"
  >(
    "all"
  );
  const [requestKindView, setRequestKindView] = useState<
    "all" | RequestKindKey
  >("all");
  const deferredSearchQuery = useDeferredValue(
    searchQuery.trim().toLowerCase()
  );
  const [, setLocation] = useLocation();
  const [detailRouteMatch, detailRouteParams] = useRoute(
    "/admin/messages/:requestId"
  );
  const routeRequestId = useMemo(() => {
    if (!detailRouteMatch) return "";
    const raw = String(detailRouteParams?.requestId || "").trim();
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [detailRouteMatch, detailRouteParams?.requestId]);
  const isRequestDetailsRouteActive = Boolean(routeRequestId);
  const [requestedRequestId] = useState(() => {
    if (typeof window === "undefined") return "";
    return (
      new URLSearchParams(window.location.search).get("requestId")?.trim() || ""
    );
  });

  const navigateToRequestDetails = (requestId: string, replace = false) => {
    const normalizedId = String(requestId || "").trim();
    if (!normalizedId) return;
    setLocation(`/admin/messages/${encodeURIComponent(normalizedId)}`, {
      replace,
    });
  };

  const navigateToMessagesList = () => {
    setSelectedMessage(null);
    setInternalNotes("");
    setApprovedAmount("");
    setContractDoc(null);
    setInvestmentDoc(null);
    setDraftFile(null);
    setLocalUploadedByKind({});
    setR2DetectedPathByKind({});
    setR2ProbeStatusByKind({});
    setReturnDialogOpen(false);
    setReturnNote("");
    setStopInvestmentDialogOpen(false);
    setStopCloseDate(toDateInputValue(new Date()));
    setStopReason("");
    setSettlementDocumentFile(null);
    setSettlementDocuments([]);
    setSettlementDocumentsLoading(false);
    setSettlementDocumentBusy(false);
    setLocation("/admin/messages");
  };

  /* =========================
    ✅ تحميل المشاريع مرة وحدة (عشان نعرض اسم المشروع في الجدول)
  ========================= */
  const [projectsMap, setProjectsMap] = useState<Record<string, any>>({});

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "projects"),
      snap => {
        setProjectsMap(
          buildProjectsMap(
            snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
          )
        );
      },
      error => {
        console.error(error);
      }
    );

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users"),
      snap => {
        setUsers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      },
      error => {
        console.error(error);
        toast.error("تعذر مزامنة بيانات العملاء الحالية.");
      }
    );

    return () => {
      unsub();
    };
  }, []);

  const getProjectTitle = (projectId: any) =>
    getProjectDisplayTitleById(projectsMap, projectId, "—") || "—";

  const getProjectRemaining = (projectId: any) => {
    const pid = String(projectId || "");
    if (!pid) return null;
    const p = projectsMap[pid];
    if (!p) return null;

    const { targetAmount: target, currentAmount: current } =
      getProjectComputedAmounts(p);
    if (!target) return null;
    return Math.max(0, target - current);
  };

  /* =========================
    ✅ Role permissions (MAEDIN principle)
  ========================= */
  const userIdentityIndex = useMemo(
    () => buildUserIdentityIndex(users),
    [users]
  );

  const [myRoleDb, setMyRoleDb] = useState<string>("");
  const [roleDocMissing, setRoleDocMissing] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        setRoleDocMissing(false);

        if (!user?.uid) {
          setMyRoleDb("");
          return;
        }

        // ✅ owner bootstrap by email (نجاة للحسابات القديمة)
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
          setRoleDocMissing(true);
          setMyRoleDb(String(user?.role || ""));
          return;
        }
        const role = (snap.data() as any)?.role || "";
        setMyRoleDb(String(role));
      } catch (e) {
        console.error(e);
        setRoleDocMissing(true);
        setMyRoleDb("");
      }
    };
    run();
  }, [user?.uid, user?.email]);

  const myRole = useMemo<AppRole>(() => {
    // ✅ fallback
    return normalizeRole(user?.role || myRoleDb);
  }, [myRoleDb, user?.role]);

  const canManageMessages = hasPermission(user as any, "messages.manage");
  const canManageInvestments = hasPermission(user as any, "investments.manage");
  const canEditFinancial = hasPermission(user as any, "financial.edit");
  const canOwnerAccountantActions =
    canManageMessages && (myRole === "owner" || myRole === "accountant");
  const canStaffActions =
    canManageMessages &&
    (myRole === "staff" || myRole === "admin" || myRole === "owner");
  const canAdmin =
    canManageMessages && (myRole === "admin" || myRole === "owner");

  /* =========================
    status badge
  ========================= */
  const getStatusBadge = (s: string) => {
    const approvedMeta = getClientInvestmentStatusMeta("approved");
    const map: any = {
      new: { label: "جديد", cls: "bg-orange-500" },
      in_progress: { label: "قيد المعالجة", cls: "bg-blue-500" },
      resolved: { label: "تم تعميد العميل", cls: "bg-emerald-700" },
      closed: { label: "مكتمل", cls: "bg-gray-500" },
      approved: { label: approvedMeta.label, cls: approvedMeta.cls },
      rejected: { label: "مرفوض", cls: "bg-red-600" },
      needs_account: { label: "عند المحاسب", cls: "bg-yellow-600" },
      no_account: { label: "بدون حساب", cls: "bg-rose-700" },
      waiting_client_confirmation: {
        label: "بانتظار تعميد العميل",
        cls: "bg-indigo-700",
      },
      completed: {
        label: "مكتمل",
        cls: "border border-amber-300/70 bg-slate-950 text-amber-200 shadow-sm",
      },
    };

    map.pending = { label: "قيد الانتظار", cls: "bg-amber-500 text-white" };
    map.reviewing = { label: "قيد المراجعة", cls: "bg-blue-600" };
    map.new = { label: "قيد الانتظار", cls: "bg-amber-500 text-white" };
    map.in_progress = { label: "قيد المراجعة", cls: "bg-blue-600" };
    map.resolved = { label: "موافقة أولية", cls: "bg-emerald-700" };
    map.approved = { label: "موافقة أولية", cls: "bg-green-600" };
    map.needs_account = { label: "قيد المراجعة", cls: "bg-blue-600" };
    map.waiting_client_confirmation = {
      label: "قيد المراجعة",
      cls: "bg-blue-600",
    };

    const key = normalizeRequestStatus(s);
    return map[key] || { label: key, cls: "bg-gray-400" };
  };

  /* =========================
  normalize for display
  ========================= */
  const normalizeForDisplay = (m: any) => {
    const hasInvestment = !!pick(m?.investmentId);
    const st = normalizeRequestStatus(pick(m?.status, "pending"));
    const sr = normalizeStageRole(
      pick(m?.stageRole, m?.stage, ""),
      st,
      hasInvestment
    );

    const fixed: any = {
      ...m,
      status: st,
      stageRole: sr,
      stage: pick(m?.stage, sr),
      createdAt: m?.createdAt || m?.created_at || null,
    };

    // ✅ events safe
    fixed.events = Array.isArray(m?.events) ? m.events : [];

    return fixed;
  };

  /* =========================
    load
  ========================= */
  const loadMessages = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, REQUESTS_COL),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);

      const list = snap.docs
        .map(d => ({
          id: d.id,
          ...d.data(),
        }))
        .filter(item => !isContactMessageRecord(item));

      setMessages(list);
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل الرسائل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, REQUESTS_COL), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      snap => {
        const list = snap.docs
          .map(d => ({
            id: d.id,
            ...d.data(),
          }))
          .filter(item => !isContactMessageRecord(item));
        setMessages(list);
        setLoading(false);
      },
      e => {
        console.error(e);
        toast.error("فشل تحميل الرسائل");
        setLoading(false);
      }
    );

    return () => {
      unsub();
    };
  }, []);

  /* =========================
    contracts doc load
  ========================= */
  const loadContractDoc = async (contractId: string | null) => {
    try {
      if (!contractId) {
        setContractDoc(null);
        return;
      }

      const snap = await getDoc(doc(db, "contracts", contractId));
      if (!snap.exists()) {
        setContractDoc(null);
        return;
      }

      setContractDoc({
        id: snap.id,
        ...(snap.data() as any),
      });
    } catch (e) {
      console.error(e);
      setContractDoc(null);
    }
  };

  const isInvestmentLinkedToRequest = (
    invData: Record<string, any> | null | undefined,
    requestData: Record<string, any> | null | undefined
  ) => {
    if (!invData || !requestData) return false;

    const explicitInvestmentId = pick(requestData?.investmentId);
    const currentInvestmentId = pick(invData?.id);
    if (
      explicitInvestmentId &&
      currentInvestmentId &&
      currentInvestmentId !== explicitInvestmentId
    ) {
      return false;
    }

    const requestId = pick(requestData?.id, requestData?.requestId);
    const investmentRequestId = pick(
      invData?.requestId,
      invData?.sourceRequestId,
      invData?.sourceMessageId,
      invData?.messageId
    );
    if (requestId) {
      if (investmentRequestId) {
        if (investmentRequestId !== requestId) return false;
      } else if (
        !explicitInvestmentId ||
        currentInvestmentId !== explicitInvestmentId
      ) {
        return false;
      }
    }

    const requestInvestorUid = pick(
      requestData?.investorUid,
      requestData?.userId,
      requestData?.createdByUid,
      requestData?.userSnapshot?.uid
    );
    const investmentInvestorUid = pick(invData?.investorUid, invData?.userId);
    if (
      requestInvestorUid &&
      investmentInvestorUid &&
      investmentInvestorUid !== requestInvestorUid
    ) {
      return false;
    }

    const requestProjectId = pick(
      requestData?.projectId,
      requestData?.project_id,
      requestData?.project?.id
    );
    const investmentProjectId = pick(invData?.projectId);
    if (
      requestProjectId &&
      investmentProjectId &&
      investmentProjectId !== requestProjectId
    ) {
      return false;
    }

    return true;
  };

  const loadInvestmentDoc = async (
    investmentId: string | null,
    requestData?: any
  ) => {
    try {
      const requestedInvestmentId = String(investmentId || "").trim();

      if (requestedInvestmentId) {
        const snap = await getDoc(
          doc(db, "investments", requestedInvestmentId)
        );
        if (snap.exists()) {
          const directDoc = {
            id: snap.id,
            ...(snap.data() as any),
          };

          if (
            !requestData ||
            isInvestmentLinkedToRequest(directDoc, requestData)
          ) {
            setInvestmentDoc(directDoc);
            return directDoc;
          }
        }
      }

      const requestId = pick(requestData?.id, requestData?.requestId);
      if (requestId) {
        const linkedSnap = await getDocs(
          query(
            collection(db, "investments"),
            where("requestId", "==", requestId)
          )
        );
        const linkedDoc = linkedSnap.docs
          .map(row => ({ id: row.id, ...(row.data() as any) }))
          .find(row => isInvestmentLinkedToRequest(row, requestData));

        if (linkedDoc) {
          setInvestmentDoc(linkedDoc);
          return linkedDoc;
        }
      }

      setInvestmentDoc(null);
      return null;
    } catch (e) {
      console.error(e);
      setInvestmentDoc(null);
      return null;
    }
  };

  const hydrateSelectedMessage = async (rawMessage: any) => {
    const fixed = normalizeForDisplay(rawMessage);
    const normalizedOne = {
      ...fixed,
      ...normalizeForDisplay(fixed),
    };

    const linkedInvestmentDoc = await loadInvestmentDoc(
      normalizedOne?.investmentId || null,
      normalizedOne
    );
    const hydratedMessage = linkedInvestmentDoc
      ? {
        ...normalizedOne,
        investmentId: linkedInvestmentDoc.id,
        contractId: pick(
          normalizedOne?.contractId,
          linkedInvestmentDoc?.contractId
        ),
      }
      : normalizedOne;

    setSelectedMessage(hydratedMessage);
    setInternalNotes(String(hydratedMessage.internalNotes || ""));
    setApprovedAmount(
      hydratedMessage?.approvedAmount != null
        ? String(hydratedMessage.approvedAmount)
        : hydratedMessage?.estimatedAmount != null
          ? String(hydratedMessage.estimatedAmount)
          : ""
    );

    await loadContractDoc(
      pick(hydratedMessage?.contractId, linkedInvestmentDoc?.contractId) || null
    );
  };

  const activeInvestmentId = pick(
    investmentDoc?.id,
    selectedMessage?.investmentId
  );
  const activeContractId = pick(
    investmentDoc?.contractId,
    selectedMessage?.contractId
  );

  useEffect(() => {
    if (!isRequestDetailsRouteActive || !selectedMessage?.id) return;

    const unsub = onSnapshot(
      doc(db, REQUESTS_COL, selectedMessage.id),
      snap => {
        if (!snap.exists()) return;
        const liveMessage = normalizeForDisplay({
          id: snap.id,
          ...(snap.data() as any),
        });
        setSelectedMessage((prev: any) =>
          prev && prev.id === snap.id ? { ...prev, ...liveMessage } : prev
        );
      },
      e => console.error(e)
    );

    return () => {
      unsub();
    };
  }, [isRequestDetailsRouteActive, selectedMessage?.id]);

  useEffect(() => {
    if (
      !isRequestDetailsRouteActive ||
      !selectedMessage?.id ||
      !canManageMessages ||
      selectedMessage?.adminSeenAt
    )
      return;

    const run = async () => {
      try {
        await auditedUpdateDoc({
          ref: doc(db, REQUESTS_COL, selectedMessage.id),
          data: {
            adminSeenAt: serverTimestamp(),
            adminSeenByUid: user?.uid || null,
            adminSeenByEmail: user?.email || null,
            updatedAt: serverTimestamp(),
          },
          action: AUDIT_ACTIONS.REQUEST_REVIEWED,
          category: "request",
          entityType: "request",
          source: messagesAuditSource("detail_open_seen"),
          relatedIds: { requestId: selectedMessage.id },
          message: `Marked request ${selectedMessage.id} as seen in detail view`,
          recordFailure: false,
        });
      } catch (e) {
        console.error(e);
      }
    };

    void run();
  }, [
    REQUESTS_COL,
    canManageMessages,
    isRequestDetailsRouteActive,
    selectedMessage?.id,
    selectedMessage?.adminSeenAt,
    user?.uid,
    user?.email,
  ]);

  useEffect(() => {
    if (!isRequestDetailsRouteActive || !activeInvestmentId) return;

    const unsub = onSnapshot(
      doc(db, "investments", activeInvestmentId),
      snap => {
        if (!snap.exists()) {
          setInvestmentDoc(null);
          return;
        }
        setInvestmentDoc({
          id: snap.id,
          ...(snap.data() as any),
        });
      },
      e => console.error(e)
    );

    return () => {
      unsub();
    };
  }, [isRequestDetailsRouteActive, activeInvestmentId]);

  useEffect(() => {
    if (!isRequestDetailsRouteActive) return;
    if (!activeContractId) {
      setContractDoc(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "contracts", activeContractId),
      snap => {
        if (!snap.exists()) {
          setContractDoc(null);
          return;
        }
        setContractDoc({
          id: snap.id,
          ...(snap.data() as any),
        });
      },
      e => console.error(e)
    );

    return () => {
      unsub();
    };
  }, [isRequestDetailsRouteActive, activeContractId]);

  const originalPathFromDocs = pickFirstNonEmptyString(
    resolveDocPath(investmentDoc, [
      "originalContract.path",
      "contractFile.path",
      "originalContractPath",
      "originalPath",
      "contractPath",
      "documentPath",
    ]),
    resolveDocPath(contractDoc, [
      "originalContract.path",
      "contractFile.path",
      "originalContractPath",
      "originalPath",
      "contractPath",
      "documentPath",
    ]),
    resolveDocPath(selectedMessage, [
      "originalContract.path",
      "contractFile.path",
      "originalContractPath",
      "originalPath",
      "contractPath",
      "documentPath",
    ])
  );
  const signedPathFromDocs = pickFirstNonEmptyString(
    resolveDocPath(investmentDoc, [
      "signedContract.path",
      "signedContractFile.path",
      "signedContractPath",
      "signedPath",
      "signedDocumentPath",
    ]),
    resolveDocPath(contractDoc, [
      "signedContract.path",
      "signedContractFile.path",
      "signedContractPath",
      "signedPath",
      "signedDocumentPath",
    ]),
    resolveDocPath(selectedMessage, [
      "signedContract.path",
      "signedContractFile.path",
      "signedContractPath",
      "signedPath",
      "signedDocumentPath",
    ])
  );
  const storedContractStatus = String(
    pick(
      investmentDoc?.contractStatus,
      contractDoc?.status,
      selectedMessage?.contractStatus
    )
  )
    .trim()
    .toLowerCase();

  useEffect(() => {
    setLocalUploadedByKind({});
    setR2DetectedPathByKind({});
    setR2ProbeStatusByKind({});
  }, [activeInvestmentId]);

  useEffect(() => {
    let cancelled = false;

    if (!activeInvestmentId) {
      setR2DetectedPathByKind({});
      setR2ProbeStatusByKind({});
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      const next: Partial<Record<"original" | "signed", string>> = {};
      const probe: Partial<Record<"original" | "signed", R2ProbeStatus>> = {};

      if (!originalPathFromDocs && !localUploadedByKind.original?.path) {
        const candidate = expectedContractPath(activeInvestmentId, "original");
        const status = candidate ? await r2ObjectStatus(candidate) : "unknown";
        probe.original = status;
        if (candidate && status === "exists") next.original = candidate;
      }

      if (
        !signedPathFromDocs &&
        !localUploadedByKind.signed?.path &&
        storedContractStatus !== "pending_signature"
      ) {
        const candidate = expectedContractPath(activeInvestmentId, "signed");
        const status = candidate ? await r2ObjectStatus(candidate) : "unknown";
        probe.signed = status;
        if (candidate && status === "exists") next.signed = candidate;
      }

      if (!cancelled) {
        setR2DetectedPathByKind(next);
        setR2ProbeStatusByKind(probe);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    activeInvestmentId,
    originalPathFromDocs,
    signedPathFromDocs,
    localUploadedByKind,
    storedContractStatus,
  ]);

  /* =========================
    UI filters
  ========================= */
  const normalized = useMemo(
    () => messages.map(normalizeForDisplay),
    [messages]
  );

  useEffect(() => {
    if (!requestedRequestId || isRequestDetailsRouteActive) return;
    navigateToRequestDetails(requestedRequestId, true);
  }, [
    requestedRequestId,
    isRequestDetailsRouteActive,
    navigateToRequestDetails,
  ]);

  useEffect(() => {
    if (!isRequestDetailsRouteActive || !routeRequestId) return;
    if (String(selectedMessage?.id || "").trim() === routeRequestId) return;

    setSelectedMessage(null);
    setContractDoc(null);
    setInvestmentDoc(null);
  }, [isRequestDetailsRouteActive, routeRequestId]);

  useEffect(() => {
    if (!isRequestDetailsRouteActive) {
      setSelectedMessage(null);
      setContractDoc(null);
      setInvestmentDoc(null);
      return;
    }
    if (!routeRequestId || !normalized.length) return;
    if (String(selectedMessage?.id || "").trim() === routeRequestId) return;

    const target = normalized.find(
      message => String(message?.id || "").trim() === routeRequestId
    );
    if (!target) {
      if (!loading) {
        setSelectedMessage(null);
        setContractDoc(null);
        setInvestmentDoc(null);
      }
      return;
    }

    void hydrateSelectedMessage(target);
  }, [
    isRequestDetailsRouteActive,
    routeRequestId,
    normalized,
    loading,
    selectedMessage?.id,
  ]);

  const {
    requestRows,
    filtered,
    newRequests,
    archivedRequests,
    stats,
    statusCounters,
    clientSourceCounters,
    requestKindCounters,
    selectedClient,
    selectedRequestKind,
    selectedProjectId,
    selectedProjectTitle,
    selectedAmount,
    selectedRemaining,
    selectedAmountExceeded,
    selectedRequestSummary,
    selectedContactEmail,
    selectedContactPhone,
    selectedCreatedAtValue,
    selectedUpdatedAtValue,
    selectedTrackingMeta,
    selectedTrackingSlaMeta,
    selectedStatusMeta,
    selectedStageMeta,
    selectedLastActor,
    selectedTimelineEvents,
    selectedInterestReviewMeta,
    isSelectedInvestmentRequest,
    isSelectedInterestRequest,
  } = useMessagesViewModels({
    normalized,
    selectedMessage,
    userIdentityIndex,
    projectsMap,
    deferredSearchQuery,
    requestKindView,
    view,
    helpers: LIST_VIEW_MODEL_HELPERS,
  });

  /* =========================
    flags
  ========================= */
  const isInvestment = !!selectedMessage && isSelectedInvestmentRequest;
  const selectedRequestStatus = normalizeRequestStatus(selectedMessage?.status);
  const selectedInvestmentStatus = String(
    pick(investmentDoc?.status, selectedMessage?.investmentStatus)
  )
    .trim()
    .toLowerCase();
  const isSelectedInvestmentStoppedEarly = useMemo(
    () => isInvestmentStoppedEarly(investmentDoc),
    [investmentDoc]
  );
  const selectedInvestmentStartedAt = useMemo(
    () =>
      toDateSafe(
        investmentDoc?.startAt ||
          investmentDoc?.activatedAt ||
          selectedMessage?.startAt ||
          selectedMessage?.activatedAt ||
          selectedMessage?.investmentStartAt
      ),
    [
      investmentDoc?.activatedAt,
      investmentDoc?.startAt,
      selectedMessage?.activatedAt,
      selectedMessage?.investmentStartAt,
      selectedMessage?.startAt,
    ]
  );
  const hasOperationalInvestmentStarted =
    Boolean(selectedInvestmentStartedAt) ||
    isSelectedInvestmentStoppedEarly ||
    ["active", "started", "in_progress", "completed", "closed"].includes(
      selectedInvestmentStatus
    );
  const stopDialogProjectId = pick(
    investmentDoc?.projectId,
    selectedMessage?.projectId,
    selectedMessage?.project_id
  );
  const stopDialogProjectRecord =
    projectsMap[String(stopDialogProjectId || "").trim()] || null;
  const stopDialogProjectFallback = useMemo(
    () =>
      stopDialogProjectRecord
        ? {
            annualReturn: stopDialogProjectRecord?.annualReturn ?? null,
            durationMonths:
              stopDialogProjectRecord?.durationMonths ??
              stopDialogProjectRecord?.duration ??
              null,
            plannedEndAt: stopDialogProjectRecord?.plannedEndAt ?? null,
          }
        : null,
    [stopDialogProjectRecord]
  );
  const selectedSettlement = useMemo(
    () => getInvestmentSettlementSnapshot(investmentDoc),
    [investmentDoc]
  );
  const stopSettlementPreviewState = useMemo(() => {
    if (!investmentDoc || isSelectedInvestmentStoppedEarly) {
      return {
        preview: selectedSettlement,
        error: "",
      };
    }

    if (selectedInvestmentStatus !== "active") {
      return {
        preview: null,
        error: "",
      };
    }

    try {
      return {
        preview: buildEarlyStopSettlementPreview({
          investment: investmentDoc,
          projectFallback: stopDialogProjectFallback,
          stopAt: stopCloseDate
            ? new Date(`${stopCloseDate}T12:00:00`)
            : new Date(),
          stopReason,
        }),
        error: "",
      };
    } catch (error: any) {
      return {
        preview: null,
        error: translateSettlementPreviewError(String(error?.message || "")),
      };
    }
  }, [
    investmentDoc,
    isSelectedInvestmentStoppedEarly,
    selectedInvestmentStatus,
    selectedSettlement,
    stopCloseDate,
    stopDialogProjectFallback,
    stopReason,
  ]);
  const settlementPreview = stopSettlementPreviewState.preview;
  const settlementFormulaParts = useMemo(() => {
    const raw = String(settlementPreview?.formula || "").trim();
    if (!raw) return [];

    const parts = raw
      .split(/\n+/)
      .flatMap((line) => line.split(/\s*=\s*/))
      .map((part) => part.trim())
      .filter(Boolean);

    return parts.length > 0 ? parts : [raw];
  }, [settlementPreview?.formula]);
  const humanReadableFormula = settlementPreview
    ? `${formatNumberEN(settlementPreview.principalAmount)} × (${formatNumberEN(
        settlementPreview.annualProfitRate
      )}% ÷ 100) × (${formatNumberEN(settlementPreview.investedDays)} ÷ 365)`
    : "";
  const humanReadableProfitResult = settlementPreview
    ? formatCurrencyEN(settlementPreview.calculatedProfit)
    : "";
  const stopPreviewExceedsPlannedEnd = Boolean(
    stopSettlementPreviewState.preview?.plannedEndDate &&
      stopSettlementPreviewState.preview?.investmentStopDate &&
      !isStopDateBeforePlannedEnd(
        stopSettlementPreviewState.preview.investmentStopDate,
        stopSettlementPreviewState.preview.plannedEndDate
      )
  );
  const canConfirmStopInvestment = Boolean(
    canEditFinancial &&
      !isSelectedInvestmentStoppedEarly &&
      stopSettlementPreviewState.preview &&
      !stopSettlementPreviewState.error &&
      !stopPreviewExceedsPlannedEnd
  );
  const latestSettlementDocument = useMemo(
    () =>
      pickLatestFileByCategory(
        settlementDocuments,
        INVESTMENT_SETTLEMENT_FILE_CATEGORY
      ),
    [settlementDocuments]
  );
  const latestSettlementDocumentViewUrl = latestSettlementDocument
    ? latestSettlementDocument.fileUrl ||
      buildR2DownloadUrl(latestSettlementDocument.filePath, false)
    : "";
  const latestSettlementDocumentDownloadUrl = latestSettlementDocument
    ? buildR2DownloadUrl(latestSettlementDocument.filePath, true) ||
      latestSettlementDocument.fileUrl
    : "";

  const isLockedFinal =
    String(selectedMessage?.status || "") === "completed" ||
    String(selectedMessage?.status || "") === "closed";

  /* =========================
    save notes only
  ========================= */
  const handleSaveNotesOnly = async () => {
    if (!selectedMessage) return;

    if (!canManageMessages) return toast.error("لا تملك صلاحية إدارة الطلبات.");
    if (myRole === "client") return toast.error("صلاحيتك عرض فقط.");
    if (isLockedFinal && myRole !== "owner")
      return toast.warning("الطلب مقفل ولا يمكن تعديل الملاحظات.");

    try {
      const ev = makeEvent({
        type: "notes_updated",
        title: "تحديث ملاحظات داخلية",
        note: internalNotes || null,
        ...myActor(user, myRole),
      });

      await auditedUpdateDoc({
        ref: doc(db, REQUESTS_COL, selectedMessage.id),
        data: {
          internalNotes: internalNotes || null,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(ev),
          ...actionMeta(user, myRole),
        },
        action: AUDIT_ACTIONS.REQUEST_UPDATED,
        category: "request",
        entityType: "request",
        source: messagesAuditSource("save_notes"),
        relatedIds: { requestId: selectedMessage.id },
        message: `Updated internal notes for request ${selectedMessage.id}`,
        meta: {
          noteLength: (internalNotes || "").trim().length,
        },
      });

      toast.success("تم حفظ الملاحظات");
      setSelectedMessage((prev: any) =>
        prev
          ? {
            ...prev,
            internalNotes: internalNotes || null,
            events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
          }
          : prev
      );
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الملاحظات");
    }
  };

  const loadSettlementDocumentsForInvestment = async (investmentId: string) => {
    const normalizedInvestmentId = String(investmentId || "").trim();
    if (!normalizedInvestmentId) {
      setSettlementDocuments([]);
      return [];
    }

    setSettlementDocumentsLoading(true);
    try {
      const records = await listDocumentMetadata({
        entityType: "investment",
        entityId: normalizedInvestmentId,
        investmentId: normalizedInvestmentId,
        category: INVESTMENT_SETTLEMENT_FILE_CATEGORY,
        limit: 20,
      });
      setSettlementDocuments(records);
      return records;
    } catch (error) {
      console.error("settlement_documents_load_failed", error);
      setSettlementDocuments([]);
      return [];
    } finally {
      setSettlementDocumentsLoading(false);
    }
  };

  useEffect(() => {
    if (!stopInvestmentDialogOpen || !investmentDoc?.id) {
      setSettlementDocuments([]);
      setSettlementDocumentsLoading(false);
      return;
    }

    void loadSettlementDocumentsForInvestment(String(investmentDoc.id || ""));
  }, [stopInvestmentDialogOpen, investmentDoc?.id]);

  useEffect(() => {
    if (!stopInvestmentDialogOpen || !investmentDoc) return;

    const effectiveStopDate = isSelectedInvestmentStoppedEarly
      ? selectedSettlement?.investmentStopDate ||
        toDateSafe(investmentDoc?.stoppedAt || investmentDoc?.actualEndAt)
      : new Date();

    setStopCloseDate(toDateInputValue(effectiveStopDate));
    setStopReason(
      String(selectedSettlement?.stopReason || investmentDoc?.stopReason || "")
    );
    setSettlementDocumentFile(null);
  }, [
    investmentDoc,
    isSelectedInvestmentStoppedEarly,
    selectedSettlement,
    stopInvestmentDialogOpen,
  ]);

  /* =========================
    moveTo step helper
  ========================= */
  const moveTo = async (next: {
    status: MessageStatus;
    stageRole: StageRole;
    note?: string;
    notifyClientText?: string;
    handledAction?: AdminHandledAction;
  }) => {
    if (!canManageMessages) return toast.error("لا تملك صلاحية إدارة الطلبات.");
    if (!selectedMessage) return;

    if (isLockedFinal && myRole !== "owner") {
      toast.warning("الطلب مقفل.");
      return;
    }

    if (myRole === "client") {
      const ok = next.status === "resolved" && next.stageRole === "owner";
      if (!ok) {
        toast.error(
          `العميل يقدر فقط يسوي: موافقة وتعميد (نقل إلى ${getOwnerRoleLabel()}).`
        );
        return;
      }
    }

    const ev = makeEvent({
      type: "status_changed",
      title: "تحديث خطوة الطلب",
      note:
        next.note ||
        `تم نقل الطلب إلى: ${next.status} / ${stageLabel(next.stageRole)}`,
      ...myActor(user, myRole),
      meta: { status: next.status, stageRole: next.stageRole },
    });

    await auditedUpdateDoc({
      ref: doc(db, REQUESTS_COL, selectedMessage.id),
      data: {
        status: next.status,
        stageRole: next.stageRole,
        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,
        events: arrayUnion(ev),
        ...(next.handledAction
          ? buildHandledTrackingPatch(next.handledAction)
          : {}),
        ...actionMeta(user, myRole),
      },
      action: AUDIT_ACTIONS.REQUEST_STATUS_CHANGED,
      category: "request",
      entityType: "request",
      source: messagesAuditSource("move_request"),
      relatedIds: { requestId: selectedMessage.id },
      message: `Moved request ${selectedMessage.id} to ${next.status}/${next.stageRole}`,
      meta: {
        nextStatus: next.status,
        nextStageRole: next.stageRole,
      },
    });

    if (next.handledAction) {
      await syncRelatedMessageTracking(selectedMessage.id, next.handledAction);
    }

    setSelectedMessage((prev: any) =>
      prev
        ? {
          ...prev,
          status: next.status,
          stageRole: next.stageRole,
          events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
        }
        : prev
    );

    toast.success("تم ترحيل الطلب ✅");
    loadMessages();
  };

  // 1) Staff: ترحيل مبدئي -> للمحاسب
  const stepStaffForwardToAccountant = async () => {
    if (!canStaffActions) return toast.error("هذا الإجراء للمراجع فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    await moveTo({
      status: "needs_account",
      stageRole: "accountant",
      handledAction: "mark_done",
      note: "ترحيل مبدئي من المراجع إلى المحاسب",
      notifyClientText: "تمت مراجعة طلبك مبدئيًا وهو الآن عند المحاسب.",
    });
  };

  // 2) Accountant: تمت مراجعة الحساب -> للعميل
  const stepAccountantForwardToClient = async () => {
    if (!canOwnerAccountantActions)
      return toast.error(`هذا الإجراء للمحاسب/${getOwnerRoleLabel()}`);
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    await moveTo({
      status: "waiting_client_confirmation",
      stageRole: "client",
      handledAction: "mark_done",
      note: "تمت مراجعة الحساب وترحيل الطلب للعميل للتعميد",
      notifyClientText: "تمت مراجعة الحساب. الرجاء الدخول لتعميد الطلب.",
    });
  };

  // 3) Client: موافقة وتعميد -> للأونر
  const stepClientApproveAndForwardToOwner = async () => {
    if (myRole !== "client") return toast.error("هذا الإجراء للعميل فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    await moveTo({
      status: "resolved",
      stageRole: "owner",
      note: `تم تعميد العميل — تحويل إلى ${getOwnerRoleLabel()} للتعميد النهائي`,
      notifyClientText: `تم استلام تعميدك، وسيتم الإقفال النهائي بعد مراجعة ${getOwnerRoleLabel()}.`,
    });
  };

  // 4) Owner: تعميد نهائي + قفل
  const stepOwnerFinalizeAndClose = async () => {
    if (!canManageMessages) return toast.error("لا تملك صلاحية إدارة الطلبات.");
    if (myRole !== "owner")
      return toast.error(`هذا الإجراء لـ ${getOwnerRoleLabel()} فقط`);
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    await moveTo({
      status: "completed",
      stageRole: "completed",
      handledAction: "close",
      note: "تعميد نهائي وإقفال الطلب",
      notifyClientText: "تم إقفال الطلب نهائيًا. شكرًا لك.",
    });
  };

  /* =========================
    Investment flow (Legacy)
  ========================= */

  const createPreInvestment = async () => {
    if (!selectedMessage) return;
    if (!canManageInvestments)
      return toast.error("لا تملك صلاحية إدارة الاستثمارات.");

    try {
      // ✅ إذا الطلب بدون حساب (createdByUid null) => حوّله لبدون حساب
      if (!selectedClient?.clientId) {
        const ev = makeEvent({
          type: "needs_account",
          title: "بدون حساب",
          note: "الطلب غير مرتبط حاليًا بحساب عميل حي يمكن استخدامه.",
          ...myActor(user, myRole),
          meta: { messageId: selectedMessage.id },
        });

        await auditedUpdateDoc({
          ref: doc(db, REQUESTS_COL, selectedMessage.id),
          data: {
            status: "no_account",
            stageRole: "client" as StageRole,
            events: arrayUnion(ev),
            ...buildHandledTrackingPatch("mark_done"),
            ...actionMeta(user, myRole),
          },
          action: AUDIT_ACTIONS.REQUEST_STATUS_CHANGED,
          category: "request",
          entityType: "request",
          source: messagesAuditSource("mark_no_account"),
          relatedIds: { requestId: selectedMessage.id },
          message: `Marked request ${selectedMessage.id} as no_account`,
          meta: {
            nextStatus: "no_account",
          },
        });

        toast.warning("هذا الطلب بدون حساب — تم تحويله إلى: بدون حساب");
        await syncRelatedMessageTracking(selectedMessage.id, "mark_done");
        loadMessages();
        return;
      }

      // باقي منطق pre-investment (لو موجود عندك) …
      toast.success("تم (مبدئيًا) إنشاء الاستثمار");
    } catch (e) {
      console.error(e);
      toast.error("فشل إنشاء الاستثمار");
    }
  };

  const approveRequestAndCreateInvestment = async () => {
    if (!canManageInvestments) {
      toast.error("لا تملك صلاحية إدارة الاستثمارات.");
      return;
    }
    if (!selectedMessage) return;

    if (myRole === "client") return toast.error("صلاحيتك عرض فقط.");
    if (isLockedFinal && myRole !== "owner")
      return toast.warning("الطلب مقفل.");

    if (normalizeRequestStatus(selectedMessage?.status) !== "approved") {
      return toast.warning(
        "لا يمكن إنشاء الاستثمار قبل المراجعة والموافقة الأولية."
      );
    }

    const requestId = String(selectedMessage?.id || "").trim();
    const projectId = pick(
      selectedMessage?.projectId,
      selectedMessage?.project_id,
      selectedMessage?.project?.id
    );
    const investorUid = pick(
      selectedClient?.clientId,
      selectedMessage?.investorUid,
      selectedMessage?.userId,
      selectedMessage?.createdByUid,
      selectedMessage?.userSnapshot?.uid
    );
    const amount =
      toNum(approvedAmount) ||
      toNum(selectedMessage?.approvedAmount) ||
      toNum(selectedMessage?.amount) ||
      toNum(selectedMessage?.requestedAmount) ||
      toNum(selectedMessage?.estimatedAmount);
    const projectTitle =
      getProjectDisplayTitleById(
        projectsMap,
        projectId,
        selectedMessage?.projectTitle,
        selectedMessage?.projectSnapshot?.titleAr,
        selectedMessage?.projectSnapshot?.title,
        selectedMessage?.projectSnapshot?.name
      ) || null;

    if (!requestId) return toast.error("تعذر تحديد رقم الطلب.");
    if (!projectId) return toast.error("لا يوجد مشروع مرتبط بهذا الطلب.");
    if (!investorUid) return toast.error("لا يوجد مستثمر مرتبط بهذا الطلب.");
    if (!Number.isFinite(amount) || amount <= 0)
      return toast.error("المبلغ غير صالح لإنشاء الاستثمار.");

    try {
      setApproveCreateBusy(true);

      const msgRef = doc(db, REQUESTS_COL, requestId);
      const existingInvSnap = await getDocs(
        query(
          collection(db, "investments"),
          where("requestId", "==", requestId)
        )
      );
      const existingInvIds = existingInvSnap.docs.map(row => row.id);

      let finalInvestmentId = "";

      await runAuditedOperation({
        action: AUDIT_ACTIONS.REQUEST_CONVERTED_TO_INVESTMENT,
        category: "request",
        entityType: "request",
        source: messagesAuditSource("approve_request_create_investment"),
        relatedIds: {
          requestId,
          projectId: projectId || undefined,
          userId: investorUid || undefined,
        },
        message: `Converted request ${requestId} into investment`,
        meta: {
          amount,
          projectName: projectTitle || null,
        },
        targets: [{ ref: msgRef, entityType: "request" }],
        execute: async () =>
          runTransaction(db, async tx => {
            const msgSnap = await tx.get(msgRef);
            if (!msgSnap.exists()) throw new Error("request_not_found");

            const msgData = msgSnap.data() as any;
            if (normalizeRequestStatus(msgData?.status) !== "approved") {
              throw new Error("request_not_initially_approved");
            }
            const candidateInvestmentIds = Array.from(
              new Set(
                [pick(msgData?.investmentId), ...existingInvIds].filter(Boolean)
              )
            );
            let linkedInvId = "";
            const explicitLinkedInvestmentId = pick(msgData?.investmentId);

            for (const candidateInvestmentId of candidateInvestmentIds) {
              const candidateInvRef = doc(
                db,
                "investments",
                candidateInvestmentId
              );
              const candidateInvSnap = await tx.get(candidateInvRef);
              if (!candidateInvSnap.exists()) continue;

              const candidateInvData = candidateInvSnap.data() as any;
              const candidateRequestId = pick(
                candidateInvData?.requestId,
                candidateInvData?.sourceRequestId,
                candidateInvData?.sourceMessageId,
                candidateInvData?.messageId
              );
              const candidateInvestorUid = pick(
                candidateInvData?.investorUid,
                candidateInvData?.userId
              );
              const candidateProjectId = pick(candidateInvData?.projectId);

              if (candidateRequestId) {
                if (candidateRequestId !== requestId) continue;
              } else if (
                !explicitLinkedInvestmentId ||
                explicitLinkedInvestmentId !== candidateInvSnap.id
              ) {
                continue;
              }
              if (candidateInvestorUid && candidateInvestorUid !== investorUid)
                continue;
              if (candidateProjectId && candidateProjectId !== projectId)
                continue;

              linkedInvId = candidateInvSnap.id;
              break;
            }

            if (linkedInvId) {
              finalInvestmentId = linkedInvId;
              const linkedInvRef = doc(db, "investments", linkedInvId);
              tx.set(
                linkedInvRef,
                {
                  requestId,
                  sourceRequestId: requestId,
                  sourceMessageId: requestId,
                  projectId,
                  investorUid,
                  userId: investorUid,
                  investorName:
                    pick(
                      msgData?.investorName,
                      msgData?.userSnapshot?.displayName,
                      selectedMessage?.investorName
                    ) || null,
                  investorEmail:
                    pick(
                      msgData?.investorEmail,
                      msgData?.userSnapshot?.email
                    ) || null,
                  investorPhone:
                    pick(
                      msgData?.investorPhone,
                      msgData?.userSnapshot?.phone
                    ) || null,
                  amount,
                  status: "pending_contract",
                  contractStatus: "draft",
                  projectTitle: projectTitle || null,
                  projectSnapshot:
                    msgData?.projectSnapshot ||
                    selectedMessage?.projectSnapshot ||
                    null,
                  updatedAt: serverTimestamp(),
                  updatedByUid: user?.uid || null,
                  updatedByEmail: user?.email || null,
                },
                { merge: true }
              );
            } else {
              const invRef = doc(collection(db, "investments"));
              finalInvestmentId = invRef.id;
              tx.set(invRef, {
                requestId,
                sourceRequestId: requestId,
                sourceMessageId: requestId,
                projectId,
                investorUid,
                userId: investorUid,
                investorName:
                  pick(
                    msgData?.investorName,
                    msgData?.userSnapshot?.displayName,
                    selectedMessage?.investorName
                  ) || null,
                investorEmail:
                  pick(msgData?.investorEmail, msgData?.userSnapshot?.email) ||
                  null,
                investorPhone:
                  pick(msgData?.investorPhone, msgData?.userSnapshot?.phone) ||
                  null,
                amount,
                status: "pending_contract",
                contractStatus: "draft",
                source: "interest_request",
                projectTitle: projectTitle || null,
                projectSnapshot:
                  msgData?.projectSnapshot ||
                  selectedMessage?.projectSnapshot ||
                  null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdByUid: user?.uid || null,
                createdByEmail: user?.email || null,
              });
            }

            const ev = makeEvent({
              type: "investment_created",
              title: "قبول الطلب وإنشاء الاستثمار",
              note: "تم قبول طلب الاهتمام وإنشاء سجل استثمار، ويجري تجهيز العقد.",
              ...myActor(user, myRole),
              meta: {
                requestId,
                investmentId: finalInvestmentId,
                projectId,
                investorUid,
                amount,
                investmentStatus: "pending_contract",
              },
            });

            tx.update(msgRef, {
              requestId,
              status: "approved",
              stageRole: "investment" as StageRole,
              stage: "investment",
              approvedAmount: amount,
              investmentId: finalInvestmentId,
              investmentStatus: "pending_contract",
              contractStatus: "draft",
              investmentCreatedAt: serverTimestamp(),
              investmentCreatedByUid: user?.uid || null,
              investmentCreatedByEmail: user?.email || null,
              updatedAt: serverTimestamp(),
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
              events: arrayUnion(ev),
              ...buildHandledTrackingPatch("approve"),
              ...actionMeta(user, myRole),
            });
          }),
      });

      toast.success("تم قبول الطلب وإنشاء الاستثمار ✅");
      setSelectedMessage((prev: any) =>
        prev
          ? {
            ...prev,
            status: "approved",
            stageRole: "investment",
            stage: "investment",
            approvedAmount: amount,
            investmentId: finalInvestmentId,
            investmentStatus: "pending_contract",
            contractStatus: "draft",
          }
          : prev
      );
      await syncRelatedMessageTracking(requestId, "approve");
      loadMessages();
    } catch (e: any) {
      console.error(e);
      const errorCode = String(e?.message || "");
      if (errorCode === "request_not_initially_approved") {
        toast.error(
          "يلزم إنهاء المراجعة والموافقة الأولية قبل إنشاء الاستثمار."
        );
      } else if (errorCode === "request_not_found") {
        toast.error("الطلب غير موجود أو تم حذفه.");
      } else {
        toast.error("فشل تنفيذ عملية قبول الطلب وإنشاء الاستثمار");
      }
    } finally {
      setApproveCreateBusy(false);
    }
  };

  const createContractForInvestment = async () => {
    if (!canManageInvestments) {
      toast.error("لا تملك صلاحية إدارة الاستثمارات.");
      return;
    }
    if (!selectedMessage) return;

    if (!canAdmin) {
      toast.error(`هذا الإجراء يتطلب صلاحية المدير أو ${getOwnerRoleLabel()}.`);
      return;
    }

    const investmentId = String(selectedMessage?.investmentId || "").trim();
    if (!investmentId) {
      toast.error("لا يوجد investmentId مرتبط بهذا الطلب.");
      return;
    }

    if (!draftFile) {
      toast.warning("الرجاء اختيار ملف PDF");
      return;
    }

    const draftFileName = String(draftFile.name || "").toLowerCase();
    const draftFileMime = String(draftFile.type || "").toLowerCase();
    const isPdf =
      draftFileMime === "application/pdf" || draftFileName.endsWith(".pdf");
    if (!isPdf) {
      toast.warning("الرجاء اختيار ملف PDF");
      return;
    }

    let uploadedResult: UploadDocumentResult | null = null;

    try {
      setContractBusy(true);
      const hadSignedBeforeRevision = hasSignedContract;

      // ARCHITECTURE NOTE (2026-03-12):
      // STEP 1 uploads the file through Cloudflare Worker -> R2 -> D1.
      // Firestore updates below are limited to workflow state only. Do not
      // reintroduce originalContract/contractFile metadata writes here.
      uploadedResult = await uploadInvestmentDocument({
        entityType: "investment",
        entityId: investmentId,
        category: "contract_original",
        investmentId,
        contractId:
          String(selectedMessage.contractId || "").trim() || undefined,
        requestId: String(selectedMessage.id || "").trim() || undefined,
        uploadedBy: String(user?.uid || "").trim() || undefined,
        file: draftFile,
        kind: "original",
      });
      console.log("[upload] stage A completed", uploadedResult);
      setLocalUploadedByKind({
        original: uploadedResult,
      });
      setDraftFile(null);
      console.log("[upload] updating workflow state in firestore", {
        investmentId,
        requestId: selectedMessage.id,
      });
      await runAuditedOperation({
        action: AUDIT_ACTIONS.CONTRACT_UPLOADED,
        category: "contract",
        entityType: "investment",
        source: messagesAuditSource("upload_contract"),
        relatedIds: {
          requestId: selectedMessage.id,
          investmentId,
          contractId: String(selectedMessage.contractId || "") || undefined,
        },
        message: `Uploaded contract for investment ${investmentId}`,
        meta: {
          contractVersionSource: "cloudflare_upload",
        },
        targets: [
          {
            ref: doc(db, REQUESTS_COL, selectedMessage.id),
            entityType: "request",
            label: "request",
          },
          {
            ref: doc(db, "investments", investmentId),
            entityType: "investment",
          },
        ],
        execute: async () =>
          runTransaction(db, async tx => {
            const msgRef = doc(db, REQUESTS_COL, selectedMessage.id);
            const invRef = doc(db, "investments", investmentId);
            const invSnap = await tx.get(invRef);
            if (!invSnap.exists()) {
              throw new Error("investment_not_found");
            }

            const inv = (invSnap.data() || {}) as Record<string, any>;
            const now = serverTimestamp();
            const currentVersion = toPositiveInt(
              inv?.contractVersion ??
              inv?.originalContract?.version ??
              inv?.contractFile?.version
            );
            const nextContractVersion =
              currentVersion > 0 ? currentVersion + 1 : 1;
            const hasSignedFromDoc = Boolean(
              String(inv?.signedContract?.path || "").trim() ||
              String(inv?.signedContractFile?.path || "").trim() ||
              String(inv?.signedContract?.url || "").trim() ||
              String(inv?.signedContractFile?.url || "").trim() ||
              String(inv?.signedContractPath || "").trim() ||
              String(inv?.signedPath || "").trim() ||
              String(inv?.signedDocumentPath || "").trim() ||
              String(inv?.signedContractUrl || "").trim()
            );
            const hasSigned = hadSignedBeforeRevision || hasSignedFromDoc;
            const resolvedContractId = String(
              inv?.contractId || selectedMessage.contractId || ""
            ).trim();
            const contractRef = resolvedContractId
              ? doc(db, "contracts", resolvedContractId)
              : null;
            const staleSignedPatch = {
              signedContract: deleteField(),
              signedContractFile: deleteField(),
              signedContractPath: deleteField(),
              signedPath: deleteField(),
              signedDocumentPath: deleteField(),
              signedContractUrl: deleteField(),
              signedAgainstContractVersion: deleteField(),
              signedContractOutdated: hasSigned,
              requiresResign: hasSigned,
              signedContractOutdatedAt: hasSigned ? now : deleteField(),
              signedAt: deleteField(),
              verifiedAt: deleteField(),
              verifiedByUid: deleteField(),
              verifiedByEmail: deleteField(),
            };

            tx.set(
              invRef,
              {
                contractVersion: nextContractVersion,
                contractStatus: hasSigned ? "pending_signature" : "sent",
                status: "signing",
                updatedAt: now,
                ...staleSignedPatch,
              },
              { merge: true }
            );
            tx.set(
              msgRef,
              {
                stageRole: "contract",
                contractStatus: hasSigned ? "pending_signature" : "sent",
                investmentStatus: "signing",
                updatedAt: now,
                updatedByUid: user?.uid || null,
                updatedByEmail: user?.email || null,
                ...buildHandledTrackingPatch("mark_done"),
                ...staleSignedPatch,
              },
              { merge: true }
            );
            if (contractRef) {
              tx.set(
                contractRef,
                {
                  contractVersion: nextContractVersion,
                  status: hasSigned ? "pending_signature" : "sent",
                  contractStatus: hasSigned ? "pending_signature" : "sent",
                  updatedAt: now,
                  updatedByUid: user?.uid || null,
                  updatedByEmail: user?.email || null,
                  ...staleSignedPatch,
                },
                { merge: true }
              );
            }
          }),
      });
      console.log("[upload] workflow state updated in firestore", {
        investmentId,
        requestId: selectedMessage.id,
      });

      toast.success("تم رفع العقد الأصلي بنجاح");
      await syncRelatedMessageTracking(selectedMessage.id, "mark_done");
      await loadInvestmentDoc(investmentId);
      await loadMessages();
    } catch (e: any) {
      if (uploadedResult) {
        console.error("[upload] workflow state update failed", e, {
          investmentId,
          uploadedPath: uploadedResult.path,
        });
        toast.warning("تم رفع الملف لكن تعذر تحديث حالة العقد تلقائيا.");
      } else {
        console.error("[upload] failed", e);
        toast.error(e?.message || "فشل الرفع");
      }
    } finally {
      setContractBusy(false);
    }
  };

  const sendContractForSigning = async () => {
    toast.info("إرسال للتوقيع (مستقبل)");
  };

  const returnContractWithNote = async () => {
    toast.info("إرجاع العقد (مستقبل)");
  };

  const finalizeInvestment = async () => {
    if (!selectedMessage) return;

    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    try {
      setFinalizeBusy(true);

      await runAuditedOperation({
        action: AUDIT_ACTIONS.REQUEST_STATUS_CHANGED,
        category: "request",
        entityType: "request",
        source: messagesAuditSource("finalize_request"),
        relatedIds: { requestId: selectedMessage.id },
        message: `Finalized request ${selectedMessage.id}`,
        meta: {
          nextStatus: "completed",
        },
        targets: [
          {
            ref: doc(db, REQUESTS_COL, selectedMessage.id),
            entityType: "request",
          },
        ],
        execute: async () =>
          runTransaction(db, async tx => {
            const msgRef = doc(db, REQUESTS_COL, selectedMessage.id);

            tx.update(msgRef, {
              status: "completed",
              stageRole: "completed" as StageRole,
              finalizedAt: serverTimestamp(),
              finalizedByUid: user?.uid || null,
              finalizedByEmail: user?.email || null,
              updatedAt: serverTimestamp(),
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
              events: arrayUnion(
                makeEvent({
                  type: "finalized",
                  title: "ترحيل نهائي للمشروع",
                  note: "تم الترحيل النهائي وقفل الطلب.",
                  ...myActor(user, myRole),
                  meta: { messageId: selectedMessage.id },
                })
              ),
              ...buildHandledTrackingPatch("close"),
              ...actionMeta(user, myRole),
            });
          }),
      });

      toast.success("تم الترحيل النهائي ✅");
      await syncRelatedMessageTracking(selectedMessage.id, "close");
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل الترحيل النهائي");
    } finally {
      setFinalizeBusy(false);
    }
  };

  const verifySignedContract = async () => {
    if (!canManageInvestments) {
      toast.error("لا تملك صلاحية إدارة الاستثمارات.");
      return;
    }
    if (!selectedMessage) return;

    if (!canAdmin) {
      toast.error(`هذا الإجراء يتطلب صلاحية المدير أو ${getOwnerRoleLabel()}.`);
      return;
    }

    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    const investmentId = String(selectedMessage?.investmentId || "").trim();
    if (!investmentId) {
      toast.error("لا يوجد استثمار مرتبط بهذا الطلب.");
      return;
    }

    try {
      setFinalizeBusy(true);
      const verifiedAt = serverTimestamp();

      await runAuditedOperation({
        action: AUDIT_ACTIONS.CONTRACT_VERIFIED,
        category: "contract",
        entityType: "investment",
        source: messagesAuditSource("verify_signed_contract"),
        relatedIds: {
          requestId: selectedMessage.id,
          investmentId,
          contractId: String(selectedMessage.contractId || "") || undefined,
        },
        message: `Verified signed contract for investment ${investmentId}`,
        targets: [
          {
            ref: doc(db, REQUESTS_COL, selectedMessage.id),
            entityType: "request",
            label: "request",
          },
          {
            ref: doc(db, "investments", investmentId),
            entityType: "investment",
          },
        ],
        execute: async () =>
          runTransaction(db, async tx => {
            const msgRef = doc(db, REQUESTS_COL, selectedMessage.id);
            const invRef = doc(db, "investments", investmentId);

            const [msgSnap, invSnap] = await Promise.all([
              tx.get(msgRef),
              tx.get(invRef),
            ]);
            if (!msgSnap.exists()) throw new Error("request_not_found");
            if (!invSnap.exists()) throw new Error("investment_not_found");

            const msgData = (msgSnap.data() || {}) as Record<string, any>;
            const invData = (invSnap.data() || {}) as Record<string, any>;
            const currentInvestmentStatus = String(invData?.status || "")
              .trim()
              .toLowerCase();
            if (
              ["active", "completed", "closed"].includes(
                currentInvestmentStatus
              )
            ) {
              throw new Error("investment_already_activated");
            }
            const currentContractStatus = String(
              pick(
                invData?.contractStatus,
                msgData?.contractStatus,
                selectedMessage?.contractStatus
              )
            )
              .trim()
              .toLowerCase();
            const fallbackSignedPath = pick(
              invData?.signedContract?.path,
              invData?.signedContractFile?.path,
              invData?.signedContractPath,
              invData?.signedPath,
              invData?.signedDocumentPath,
              invData?.signedContractUrl,
              signedContractPath
            );
            const canVerifyLegacySignedUpload =
              !!fallbackSignedPath &&
              ["sent", "pending_signature", "draft"].includes(
                currentContractStatus
              );
            if (
              !["under_review", "signed"].includes(currentContractStatus) &&
              !canVerifyLegacySignedUpload
            ) {
              throw new Error("contract_not_ready_for_verification");
            }

            const hasSignedPath = Boolean(fallbackSignedPath);
            if (!hasSignedPath) {
              throw new Error("signed_contract_missing");
            }

            const originalVersion = toPositiveInt(
              invData?.contractVersion ??
              invData?.originalContract?.version ??
              invData?.contractFile?.version
            );
            const signedForVersion = toPositiveInt(
              invData?.signedAgainstContractVersion ??
              invData?.signedContract?.signedForVersion ??
              invData?.signedContract?.originalVersion
            );
            const outdatedFlag = toBooleanSafe(
              invData?.signedContractOutdated ??
              invData?.requiresResign ??
              invData?.signedContract?.isOutdated
            );
            const isSignedOutdated =
              outdatedFlag ||
              (originalVersion > 0 &&
                signedForVersion > 0 &&
                signedForVersion < originalVersion);
            if (isSignedOutdated) {
              throw new Error("signed_contract_outdated");
            }
            const shouldBackfillSignedDoc =
              !pick(
                invData?.signedContract?.path,
                invData?.signedContractFile?.path,
                invData?.signedContractPath,
                invData?.signedPath,
                invData?.signedDocumentPath,
                invData?.signedContractUrl
              ) && !!fallbackSignedPath;
            const resolvedSignedForVersion =
              signedForVersion || originalVersion || 1;
            const fallbackSignedFileName = fallbackSignedPath
              ? getFileNameFromPath(fallbackSignedPath)
              : "signed.pdf";

            const contractId = String(
              pick(
                invData?.contractId,
                msgData?.contractId,
                selectedMessage?.contractId
              )
            ).trim();
            const contractRef = contractId
              ? doc(db, "contracts", contractId)
              : null;

            tx.set(
              invRef,
              {
                ...(shouldBackfillSignedDoc
                  ? {
                    signedContract: {
                      fileName: fallbackSignedFileName,
                      path: fallbackSignedPath,
                      storagePath: fallbackSignedPath,
                      uploadedAt: invData?.signedAt || verifiedAt,
                      uploadedBy:
                        invData?.lastDocumentUploadBy ||
                        invData?.investorUid ||
                        null,
                      signedForVersion: resolvedSignedForVersion,
                      originalVersion: resolvedSignedForVersion,
                      isOutdated: false,
                      outdatedAt: null,
                      outdatedByOriginalVersion: null,
                    },
                    signedContractFile: {
                      fileName: fallbackSignedFileName,
                      path: fallbackSignedPath,
                      storagePath: fallbackSignedPath,
                      uploadedAt: invData?.signedAt || verifiedAt,
                      uploadedBy:
                        invData?.lastDocumentUploadBy ||
                        invData?.investorUid ||
                        null,
                      signedForVersion: resolvedSignedForVersion,
                    },
                    signedAgainstContractVersion: resolvedSignedForVersion,
                    signedContractOutdated: false,
                    requiresResign: false,
                    signedContractOutdatedAt: null,
                  }
                  : {}),
                status: "signed",
                contractStatus: "approved",
                signedAt: invData?.signedAt || verifiedAt,
                verifiedAt,
                verifiedByUid: user?.uid || null,
                verifiedByEmail: user?.email || null,
                updatedAt: verifiedAt,
                updatedByUid: user?.uid || null,
                updatedByEmail: user?.email || null,
              },
              { merge: true }
            );

            if (contractRef) {
              tx.set(
                contractRef,
                {
                  ...(shouldBackfillSignedDoc
                    ? {
                      signedContract: {
                        fileName: fallbackSignedFileName,
                        path: fallbackSignedPath,
                        storagePath: fallbackSignedPath,
                        uploadedAt: invData?.signedAt || verifiedAt,
                        uploadedBy:
                          invData?.lastDocumentUploadBy ||
                          invData?.investorUid ||
                          null,
                        signedForVersion: resolvedSignedForVersion,
                        originalVersion: resolvedSignedForVersion,
                        isOutdated: false,
                        outdatedAt: null,
                        outdatedByOriginalVersion: null,
                      },
                      signedContractFile: {
                        fileName: fallbackSignedFileName,
                        path: fallbackSignedPath,
                        storagePath: fallbackSignedPath,
                        uploadedAt: invData?.signedAt || verifiedAt,
                        uploadedBy:
                          invData?.lastDocumentUploadBy ||
                          invData?.investorUid ||
                          null,
                        signedForVersion: resolvedSignedForVersion,
                      },
                      signedAgainstContractVersion: resolvedSignedForVersion,
                      signedContractOutdated: false,
                      requiresResign: false,
                      signedContractOutdatedAt: null,
                    }
                    : {}),
                  status: "approved",
                  verifiedAt,
                  verifiedByUid: user?.uid || null,
                  verifiedByEmail: user?.email || null,
                  updatedAt: verifiedAt,
                  updatedByUid: user?.uid || null,
                  updatedByEmail: user?.email || null,
                },
                { merge: true }
              );
            }

            tx.update(msgRef, {
              stageRole: "owner" as StageRole,
              contractStatus: "approved",
              investmentStatus: "signed",
              verifiedAt,
              verifiedByUid: user?.uid || null,
              verifiedByEmail: user?.email || null,
              updatedAt: verifiedAt,
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
              events: arrayUnion(
                makeEvent({
                  type: "contract_verified",
                  title: "تم التحقق من العقد الموقّع",
                  note: "تم اعتماد العقد الموقّع، وأصبح الاستثمار جاهزًا للبدء.",
                  ...myActor(user, myRole),
                  meta: {
                    messageId: selectedMessage.id,
                    investmentId,
                    contractStatus: "approved",
                    investmentStatus: "signed",
                  },
                })
              ),
              ...buildHandledTrackingPatch("approve"),
              ...actionMeta(user, myRole),
            });
          }),
      });

      toast.success("تم التحقق من العقد الموقّع.");
      await syncRelatedMessageTracking(selectedMessage.id, "approve");
      await loadInvestmentDoc(investmentId);
      await loadMessages();
    } catch (e: any) {
      console.error(e);
      const code = String(e?.message || "");
      if (code === "contract_not_ready_for_verification") {
        toast.error("يجب أن يرفع المستثمر العقد الموقّع أولًا قبل التحقق.");
      } else if (code === "signed_contract_missing") {
        toast.error("لا يوجد عقد موقّع صالح للتحقق.");
      } else if (code === "signed_contract_outdated") {
        toast.error("العقد الموقّع قديم ويجب رفع نسخة محدثة.");
      } else if (code === "request_not_found") {
        toast.error("الطلب غير موجود.");
      } else if (code === "investment_not_found") {
        toast.error("سجل الاستثمار غير موجود.");
      } else {
        toast.error("فشل التحقق من العقد الموقّع.");
      }
    } finally {
      setFinalizeBusy(false);
    }
  };

  const activateInvestmentAfterApproval = async () => {
    if (!canManageInvestments) {
      toast.error("لا تملك صلاحية إدارة الاستثمارات.");
      return;
    }
    if (!selectedMessage) return;

    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    const investmentId = String(selectedMessage?.investmentId || "").trim();
    if (!investmentId) {
      toast.error("لا يوجد استثمار مرتبط بهذا الطلب.");
      return;
    }

    try {
      setFinalizeBusy(true);
      const activatedAt = Timestamp.now();
      const activatedAtDate = activatedAt.toDate();
      const activatedAtServer = serverTimestamp();

      await runAuditedOperation({
        action: AUDIT_ACTIONS.INVESTMENT_ACTIVATED,
        category: "investment",
        entityType: "investment",
        source: messagesAuditSource("activate_investment"),
        relatedIds: {
          requestId: selectedMessage.id,
          investmentId,
        },
        message: `Activated investment ${investmentId}`,
        targets: [
          {
            ref: doc(db, REQUESTS_COL, selectedMessage.id),
            entityType: "request",
            label: "request",
          },
          {
            ref: doc(db, "investments", investmentId),
            entityType: "investment",
          },
        ],
        execute: async () =>
          runTransaction(db, async tx => {
            const msgRef = doc(db, REQUESTS_COL, selectedMessage.id);
            const invRef = doc(db, "investments", investmentId);

            const [msgSnap, invSnap] = await Promise.all([
              tx.get(msgRef),
              tx.get(invRef),
            ]);
            if (!msgSnap.exists()) throw new Error("request_not_found");
            if (!invSnap.exists()) throw new Error("investment_not_found");

            const msgData = (msgSnap.data() || {}) as Record<string, any>;
            const invData = (invSnap.data() || {}) as Record<string, any>;
            const currentInvestmentStatus = String(invData?.status || "")
              .trim()
              .toLowerCase();
            if (
              ["active", "completed", "closed"].includes(
                currentInvestmentStatus
              )
            ) {
              throw new Error("investment_already_activated");
            }
            if (currentInvestmentStatus !== "signed") {
              throw new Error("investment_not_ready_for_activation");
            }

            const contractId = String(
              pick(
                invData?.contractId,
                msgData?.contractId,
                selectedMessage?.contractId
              )
            ).trim();
            const contractRef = contractId
              ? doc(db, "contracts", contractId)
              : null;
            const contractSnap = contractRef ? await tx.get(contractRef) : null;
            const contractData =
              contractSnap && contractSnap.exists()
                ? ((contractSnap.data() || {}) as Record<string, any>)
                : null;

            const currentContractStatus = String(
              pick(
                contractData?.status,
                invData?.contractStatus,
                msgData?.contractStatus
              )
            )
              .trim()
              .toLowerCase();
            if (!CONTRACTS_DISABLED && currentContractStatus !== "approved") {
              throw new Error("contract_not_ready_for_activation");
            }

            const projectId = String(
              pick(
                invData?.projectId,
                msgData?.projectId,
                msgData?.project_id,
                selectedMessage?.projectId,
                selectedMessage?.project_id
              )
            ).trim();
            const projectRef = projectId
              ? doc(db, "projects", projectId)
              : null;
            const projectSnap = projectRef ? await tx.get(projectRef) : null;
            const projectData =
              projectSnap && projectSnap.exists()
                ? ((projectSnap.data() || {}) as Record<string, any>)
                : null;

            const settingsRef = doc(db, "settings", "app");
            const settingsSnap = await tx.get(settingsRef);
            const appSettings = settingsSnap.exists()
              ? ((settingsSnap.data() || {}) as Record<string, any>)
              : null;

            const amount =
              toNum(invData?.approvedAmount) ||
              toNum(invData?.amount) ||
              toNum(msgData?.approvedAmount) ||
              toNum(msgData?.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
              throw new Error("missing_amount");
            }

            const activationTerms = resolveInvestmentActivationTerms({
              amount,
              investment: invData,
              project: projectData,
              appSettings,
              startAt: activatedAtDate,
            });
            const plannedEndAt = Timestamp.fromDate(
              activationTerms.plannedEndAt
            );
            const legalTermsSnapshot = {
              version: 1,
              approvedAt: activatedAt,
              principalAmount: amount,
              annualReturnPercent: activationTerms.annualReturn,
              annualReturnSource: activationTerms.annualReturnSource,
              durationMonths: activationTerms.durationMonths,
              durationSource: activationTerms.durationSource,
              startAt: activatedAt,
              endAt: plannedEndAt,
              expectedProfit: activationTerms.expectedProfit,
              formula: activationTerms.legalTermsSnapshot.formula,
              isFrozen: true,
            };
            const projectTitleAtSign =
              pick(
                projectData?.titleAr,
                projectData?.title,
                msgData?.projectTitle,
                msgData?.projectSnapshot?.titleAr,
                msgData?.projectSnapshot?.title,
                invData?.projectTitle
              ) || null;

            tx.set(
              invRef,
              {
                status: "active",
                contractStatus: "approved",
                approvedAmount: amount,
                startAt: activatedAt,
                plannedEndAt,
                annualReturnAtSign: activationTerms.annualReturn,
                durationMonthsAtSign: activationTerms.durationMonths,
                expectedProfit: activationTerms.expectedProfit,
                earnedProfit: null,
                actualEndAt: null,
                withdrawnAt: null,
                exitType: null,
                projectTitleAtSign,
                termsLockedAt: activatedAt,
                legalTermsSnapshot,
                activatedAt,
                activatedByUid: user?.uid || null,
                activatedByEmail: user?.email || null,
                finalizedAt: activatedAtServer,
                updatedAt: activatedAtServer,
                updatedByUid: user?.uid || null,
                updatedByEmail: user?.email || null,
              },
              { merge: true }
            );

            if (contractRef) {
              tx.set(
                contractRef,
                {
                  status: "approved",
                  amount,
                  projectId: projectId || null,
                  investmentId,
                  requestId: selectedMessage.id,
                  approvedAt: activatedAt,
                  approvedByUid: user?.uid || null,
                  approvedByEmail: user?.email || null,
                  termsLockedAt: activatedAt,
                  legalTermsSnapshot,
                  legalReference: {
                    source: "investment.activation",
                    isFinal: true,
                    version: 1,
                  },
                  updatedAt: activatedAtServer,
                  updatedByUid: user?.uid || null,
                  updatedByEmail: user?.email || null,
                },
                { merge: true }
              );
            }

            tx.update(msgRef, {
              status: "completed",
              stageRole: "completed" as StageRole,
              contractStatus: "approved",
              investmentStatus: "active",
              finalizedAt: activatedAtServer,
              finalizedByUid: user?.uid || null,
              finalizedByEmail: user?.email || null,
              updatedAt: activatedAtServer,
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
              events: arrayUnion(
                makeEvent({
                  type: "finalized",
                  title: "اعتماد العقد وتفعيل الاستثمار",
                  note: "تم الاعتماد النهائي للعقد وتفعيل الاستثمار. تبدأ مدة الاستثمار وحساب الربح من وقت الاعتماد النهائي فقط.",
                  ...myActor(user, myRole),
                  meta: {
                    messageId: selectedMessage.id,
                    investmentId,
                    projectId: projectId || null,
                    contractStatus: "approved",
                    investmentStatus: "active",
                  },
                })
              ),
              ...buildHandledTrackingPatch("close"),
              ...actionMeta(user, myRole),
            });
          }),
      });

      toast.success("تم اعتماد العقد وتفعيل الاستثمار");
      await syncRelatedMessageTracking(selectedMessage.id, "close");
      loadMessages();
    } catch (e: any) {
      console.error(e);
      const code = String(e?.message || "");
      if (code === "request_not_found") {
        toast.error("الطلب غير موجود.");
      } else if (code === "investment_not_found") {
        toast.error("سجل الاستثمار غير موجود.");
      } else if (code === "contract_not_ready_for_activation") {
        toast.error("لا يمكن تفعيل الاستثمار قبل اكتمال توقيع العقد ومراجعته.");
      } else if (code === "investment_not_ready_for_activation") {
        toast.error("يجب التحقق من العقد الموقّع قبل تفعيل الاستثمار.");
      } else if (code === "investment_already_activated") {
        toast.error("الاستثمار مفعّل مسبقًا.");
      } else if (
        code === "missing_amount" ||
        code === "missing_final_annual_return" ||
        code === "missing_final_duration_months"
      ) {
        toast.error("بيانات التفعيل النهائية غير مكتملة بعد.");
      } else {
        toast.error("فشل اعتماد العقد وتفعيل الاستثمار");
      }
    } finally {
      setFinalizeBusy(false);
    }
  };

  const openStopInvestmentDialog = () => {
    const investmentId = String(
      pick(investmentDoc?.id, selectedMessage?.investmentId)
    ).trim();

    if (!investmentId) {
      toast.error("لا يوجد استثمار مرتبط بهذا الطلب.");
      return;
    }

    if (!investmentDoc?.id) {
      toast.warning("جاري تحميل بيانات الاستثمار، حاول مرة أخرى بعد لحظة.");
      return;
    }

    setStopInvestmentDialogOpen(true);
  };

  const uploadSettlementDocumentForInvestment = async (
    investmentRecord: any,
    file: File | null,
    existingDocuments: CloudflareFileRecord[] = settlementDocuments
  ) => {
    if (!file || !investmentRecord?.id) return null;

    const latestVersion = Math.max(
      0,
      ...existingDocuments.map((record) => Number(record?.version || 0))
    );

    setSettlementDocumentBusy(true);
    try {
      await uploadInvestmentDocument({
        entityType: "investment",
        entityId: String(investmentRecord.id || ""),
        investmentId: String(investmentRecord.id || ""),
        projectId: String(investmentRecord.projectId || "") || undefined,
        uploadedBy: String(user?.uid || "") || undefined,
        category: INVESTMENT_SETTLEMENT_FILE_CATEGORY,
        file,
        kind: "attachment",
        version: latestVersion + 1,
      });

      const refreshed = await loadSettlementDocumentsForInvestment(
        String(investmentRecord.id || "")
      );
      setSettlementDocumentFile(null);
      return refreshed;
    } finally {
      setSettlementDocumentBusy(false);
    }
  };

  const uploadSettlementAttachment = async () => {
    if (!canEditFinancial) {
      toast.error("لا تملك صلاحية تعديل الشؤون المالية.");
      return;
    }
    if (!investmentDoc || !settlementDocumentFile) return;

    try {
      await uploadSettlementDocumentForInvestment(
        investmentDoc,
        settlementDocumentFile
      );
      toast.success("تم رفع مستند التسوية بنجاح.");
    } catch (error) {
      console.error(error);
      toast.error("فشل رفع مستند التسوية.");
    }
  };

  const closeInvestmentEarlyTx = async () => {
    if (!canEditFinancial) {
      toast.error("لا تملك صلاحية تعديل الشؤون المالية.");
      return;
    }
    if (!investmentDoc) return;

    const preview = stopSettlementPreviewState.preview;
    if (!preview || stopSettlementPreviewState.error) {
      toast.error(
        stopSettlementPreviewState.error || "تعذر تجهيز التسوية قبل الحفظ."
      );
      return;
    }

    if (stopPreviewExceedsPlannedEnd) {
      toast.error(
        "تاريخ الإيقاف يجب أن يكون قبل تاريخ نهاية الاستثمار المخطط."
      );
      return;
    }

    try {
      await runAuditedOperation({
        action: AUDIT_ACTIONS.INVESTMENT_STOPPED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Messages",
          method: "stop_investment_dialog",
        }),
        relatedIds: {
          requestId: String(selectedMessage?.id || "") || undefined,
          investmentId: investmentDoc.id,
          projectId: String(investmentDoc.projectId || "") || undefined,
          userId:
            String(investmentDoc.investorUid || investmentDoc.userId || "") ||
            undefined,
        },
        message: `Stopped investment ${investmentDoc.id} early from messages dialog`,
        meta: {
          closeDate: stopCloseDate,
          stopReason: preview.stopReason || null,
          investedDays: preview.investedDays,
          calculatedProfit: preview.calculatedProfit,
          totalPayout: preview.totalPayout,
          projectName: getProjectTitle(String(investmentDoc.projectId || "")),
        },
        targets: [
          {
            ref: doc(db, "investments", investmentDoc.id),
            entityType: "investment",
          },
        ],
        execute: async () =>
          runTransaction(db, async (tx) => {
            const invRef = doc(db, "investments", investmentDoc.id);
            const invSnap = await tx.get(invRef);
            if (!invSnap.exists()) throw new Error("investment_not_found");

            const inv: any = invSnap.data();
            const status = String(inv.status || "").trim().toLowerCase();

            if (["stopped", "completed", "closed"].includes(status)) {
              throw new Error("investment_already_closed");
            }
            if (status !== "active") {
              throw new Error("invalid_status_for_close");
            }

            const transactionPreview = buildEarlyStopSettlementPreview({
              investment: inv,
              projectFallback: stopDialogProjectFallback,
              stopAt: preview.investmentStopDate,
              stopReason: preview.stopReason,
            });

            if (
              transactionPreview.plannedEndDate &&
              !isStopDateBeforePlannedEnd(
                transactionPreview.investmentStopDate,
                transactionPreview.plannedEndDate
              )
            ) {
              throw new Error("stop_after_planned_end");
            }

            const closureAt = Timestamp.fromDate(
              transactionPreview.investmentStopDate
            );
            const finalizedAt = Timestamp.fromDate(new Date());

            tx.update(invRef, {
              status: "stopped",
              stoppedAt: closureAt,
              stopReason: transactionPreview.stopReason,
              actualEndAt: closureAt,
              withdrawnAt: closureAt,
              exitType: "client_requested_stop",
              stoppedByUid: user?.uid || null,
              stoppedByEmail: user?.email || null,
              earnedProfit: transactionPreview.calculatedProfit,
              actualDurationMonths: transactionPreview.actualDurationMonths,
              settlementTotal: transactionPreview.totalPayout,
              settlementPrincipal: transactionPreview.principalAmount,
              settlementAnnualReturnPercent:
                transactionPreview.annualProfitRate,
              settlementFormula: transactionPreview.formula,
              settlementLockedAt: finalizedAt,
              settlementLocked: true,
              closureLocked: true,
              finalizedAt,
              settlement: {
                kind: transactionPreview.kind,
                status: transactionPreview.status,
                policyCode: transactionPreview.policyCode,
                policyLabel: transactionPreview.policyLabel,
                principalAmount: transactionPreview.principalAmount,
                annualProfitRate: transactionPreview.annualProfitRate,
                investmentStartDate: Timestamp.fromDate(
                  transactionPreview.investmentStartDate
                ),
                plannedEndDate: transactionPreview.plannedEndDate
                  ? Timestamp.fromDate(transactionPreview.plannedEndDate)
                  : null,
                investmentStopDate: closureAt,
                originalDurationMonths:
                  transactionPreview.originalDurationMonths ?? null,
                actualDurationMonths:
                  transactionPreview.actualDurationMonths,
                investedDays: transactionPreview.investedDays,
                calculatedProfit: transactionPreview.calculatedProfit,
                totalPayout: transactionPreview.totalPayout,
                formula: transactionPreview.formula,
                stopReason: transactionPreview.stopReason,
                finalizedAt,
                finalizedByUid: user?.uid || null,
                finalizedByEmail: user?.email || null,
                documentCategory: transactionPreview.documentCategory,
              },
              events: arrayUnion(
                {
                  type: "stop_requested",
                  title: "طلب إيقاف الاستثمار",
                  note:
                    transactionPreview.stopReason || "إيقاف بطلب العميل",
                  at: finalizedAt,
                  byUid: user?.uid || null,
                  byEmail: user?.email || null,
                  meta: {
                    requestedBy: "client",
                    effectiveStopDate: closureAt,
                  },
                },
                {
                  type: "investment_stopped",
                  title: "تم إيقاف الاستثمار بطلب العميل",
                  note: transactionPreview.stopReason || null,
                  at: closureAt,
                  byUid: user?.uid || null,
                  byEmail: user?.email || null,
                  meta: {
                    requestedBy: "client",
                    settlementTotal: transactionPreview.totalPayout,
                    realizedProfit: transactionPreview.calculatedProfit,
                  },
                }
              ),
              updatedAt: new Date(),
            });
          }),
      });

      toast.success("تم إيقاف الاستثمار وتثبيت التسوية بنجاح");
      if (settlementDocumentFile) {
        try {
          await uploadSettlementDocumentForInvestment(
            investmentDoc,
            settlementDocumentFile
          );
          toast.success("تم رفع ملف التسوية النهائية.");
        } catch (uploadError) {
          console.error("settlement_document_upload_failed", uploadError);
          toast.error("تم الإيقاف لكن فشل رفع ملف التسوية.");
        }
      }
      setStopInvestmentDialogOpen(false);
    } catch (error: any) {
      console.error(error);

      switch (String(error?.message || "")) {
        case "investment_not_found":
          toast.error("سجل الاستثمار غير موجود.");
          break;
        case "investment_already_closed":
          toast.error("الاستثمار مغلق أو موقوف مسبقًا.");
          break;
        case "invalid_status_for_close":
          toast.error("لا يمكن إيقاف الاستثمار قبل تفعيله.");
          break;
        case "stop_after_planned_end":
          toast.error(
            "تاريخ الإيقاف يجب أن يكون قبل تاريخ نهاية الاستثمار المخطط."
          );
          break;
        default:
          toast.error("فشل إيقاف الاستثمار");
          break;
      }
    }
  };

  const rejectInvestmentRequest = async () => {
    if (!canManageMessages) {
      toast.error("لا تملك صلاحية إدارة الطلبات.");
      return;
    }
    if (!selectedMessage) return;

    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    try {
      const ev = makeEvent({
        type: "rejected",
        title: "تم رفض الطلب",
        note: "تم رفض الطلب من الإدارة.",
        ...myActor(user, myRole),
        meta: { messageId: selectedMessage.id },
      });

      await auditedUpdateDoc({
        ref: doc(db, REQUESTS_COL, selectedMessage.id),
        data: {
          status: "rejected",
          stageRole: "completed" as StageRole,
          rejectedAt: serverTimestamp(),
          rejectedByUid: user?.uid || null,
          rejectedByEmail: user?.email || null,
          events: arrayUnion(ev),
          ...buildHandledTrackingPatch("reject"),
          ...actionMeta(user, myRole),
        },
        action: AUDIT_ACTIONS.REQUEST_REJECTED,
        category: "request",
        entityType: "request",
        source: messagesAuditSource("reject_request"),
        relatedIds: { requestId: selectedMessage.id },
        message: `Rejected request ${selectedMessage.id}`,
      });

      toast.success("تم رفض الطلب");
      await syncRelatedMessageTracking(selectedMessage.id, "reject");
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل رفض الطلب");
    }
  };

  /* =========================
    طوارئ: إعادة فتح (للمسؤول التقني فقط)
  ========================= */
  const reopenMessage = async () => {
    if (!selectedMessage) return;
    if (!canManageMessages) return toast.error("لا تملك صلاحية إدارة الطلبات.");
    if (myRole !== "owner")
      return toast.error(`هذا الإجراء لـ ${getOwnerRoleLabel()} فقط`);

    try {
      setReopenBusy(true);

      const ev = makeEvent({
        type: "reopened",
        title: "تم إعادة فتح الطلب",
        note: "تم فتح الطلب مرة أخرى لمتابعة الإجراءات.",
        ...myActor(user, myRole),
      });

      await auditedUpdateDoc({
        ref: doc(db, REQUESTS_COL, selectedMessage.id),
        data: {
          status: "reviewing",
          stageRole: "review" as StageRole,
          reopenedAt: serverTimestamp(),
          reopenedByUid: user?.uid || null,
          reopenedByEmail: user?.email || null,
          events: arrayUnion(ev),
          ...buildHandledTrackingResetPatch(),
          ...actionMeta(user, myRole),
        },
        action: AUDIT_ACTIONS.REQUEST_REOPENED,
        category: "request",
        entityType: "request",
        source: messagesAuditSource("reopen_request"),
        relatedIds: { requestId: selectedMessage.id },
        message: `Reopened request ${selectedMessage.id}`,
      });

      toast.success("تمت إعادة فتح الطلب");
      await syncRelatedMessageTracking(selectedMessage.id, null);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل إعادة الفتح");
    } finally {
      setReopenBusy(false);
    }
  };

  /* =========================
    UI flags
  ========================= */
  const canCreateContract =
    !CONTRACTS_DISABLED &&
    canManageInvestments &&
    isInvestment &&
    !!selectedClient?.clientId &&
    !!selectedMessage?.investmentId &&
    !selectedMessage?.contractId;

  const canSendForSigning =
    !CONTRACTS_DISABLED &&
    canManageInvestments &&
    isInvestment &&
    !!selectedMessage?.investmentId &&
    !!selectedMessage?.contractId;

  const originalExpectedPath = expectedContractPath(
    activeInvestmentId,
    "original"
  );
  const originalContractPath = pick(
    localUploadedByKind.original?.path,
    originalPathFromDocs,
    r2DetectedPathByKind.original,
    !r2ProbeStatusByKind.original || r2ProbeStatusByKind.original === "unknown"
      ? originalExpectedPath
      : ""
  );
  const originalContractUrlFromDocs = pickFirstNonEmptyString(
    resolveDocPath(investmentDoc, [
      "originalContract.url",
      "contractFile.url",
      "contractUrl",
    ]),
    resolveDocPath(contractDoc, [
      "originalContract.url",
      "contractFile.url",
      "contractUrl",
    ]),
    resolveDocPath(selectedMessage, [
      "originalContract.url",
      "contractFile.url",
      "contractUrl",
    ])
  );
  const originalContractFileName = pickFirstNonEmptyString(
    localUploadedByKind.original?.fileName,
    resolveDocPath(investmentDoc, [
      "originalContract.fileName",
      "contractFile.fileName",
    ]),
    resolveDocPath(contractDoc, [
      "originalContract.fileName",
      "contractFile.fileName",
    ]),
    resolveDocPath(selectedMessage, [
      "originalContract.fileName",
      "contractFile.fileName",
    ]),
    originalContractPath ? getFileNameFromPath(originalContractPath) : ""
  );
  const hasOriginalContract = Boolean(
    originalContractPath || originalContractUrlFromDocs
  );
  const originalContractViewUrl = pick(
    localUploadedByKind.original?.fileUrl,
    buildR2DownloadUrl(originalContractPath, false),
    originalContractUrlFromDocs
  );
  const originalContractDownloadUrl = pick(
    buildR2DownloadUrl(originalContractPath, true),
    originalContractUrlFromDocs
  );

  const signedContractPath = pick(
    localUploadedByKind.signed?.path,
    signedPathFromDocs,
    r2DetectedPathByKind.signed,
    storedContractStatus !== "pending_signature" &&
      (!r2ProbeStatusByKind.signed || r2ProbeStatusByKind.signed === "unknown")
      ? expectedContractPath(activeInvestmentId, "signed")
      : ""
  );
  const signedContractUrlFromDocs = pickFirstNonEmptyString(
    resolveDocPath(investmentDoc, [
      "signedContract.url",
      "signedContractFile.url",
      "signedContractUrl",
    ]),
    resolveDocPath(contractDoc, [
      "signedContract.url",
      "signedContractFile.url",
      "signedContractUrl",
    ]),
    resolveDocPath(selectedMessage, [
      "signedContract.url",
      "signedContractFile.url",
      "signedContractUrl",
    ])
  );
  const signedContractFileName = pickFirstNonEmptyString(
    localUploadedByKind.signed?.fileName,
    resolveDocPath(investmentDoc, [
      "signedContract.fileName",
      "signedContractFile.fileName",
    ]),
    resolveDocPath(contractDoc, [
      "signedContract.fileName",
      "signedContractFile.fileName",
    ]),
    resolveDocPath(selectedMessage, [
      "signedContract.fileName",
      "signedContractFile.fileName",
    ]),
    signedContractPath ? getFileNameFromPath(signedContractPath) : ""
  );
  const hasSignedContract = Boolean(
    signedContractPath || signedContractUrlFromDocs
  );
  const signedContractViewUrl = pick(
    localUploadedByKind.signed?.fileUrl,
    buildR2DownloadUrl(signedContractPath, false),
    signedContractUrlFromDocs
  );
  const signedContractDownloadUrl = pick(
    buildR2DownloadUrl(signedContractPath, true),
    signedContractUrlFromDocs
  );

  const originalUploadedAt =
    resolveDocValue(investmentDoc, [
      "originalContract.uploadedAt",
      "contractFile.uploadedAt",
    ]) ??
    resolveDocValue(contractDoc, [
      "originalContract.uploadedAt",
      "contractFile.uploadedAt",
    ]) ??
    resolveDocValue(selectedMessage, [
      "originalContract.uploadedAt",
      "contractFile.uploadedAt",
    ]);
  const signedUploadedAt =
    resolveDocValue(investmentDoc, [
      "signedContract.uploadedAt",
      "signedContractFile.uploadedAt",
    ]) ??
    resolveDocValue(contractDoc, [
      "signedContract.uploadedAt",
      "signedContractFile.uploadedAt",
    ]) ??
    resolveDocValue(selectedMessage, [
      "signedContract.uploadedAt",
      "signedContractFile.uploadedAt",
    ]);

  const originalVersion = Number(
    pick(
      resolveDocValue(investmentDoc, [
        "contractVersion",
        "originalContract.version",
        "contractFile.version",
      ]),
      resolveDocValue(contractDoc, [
        "contractVersion",
        "originalContract.version",
        "contractFile.version",
      ]),
      resolveDocValue(selectedMessage, [
        "contractVersion",
        "originalContract.version",
        "contractFile.version",
      ]),
      0
    )
  );
  const signedForVersion = Number(
    pick(
      resolveDocValue(investmentDoc, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      resolveDocValue(contractDoc, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      resolveDocValue(selectedMessage, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      0
    )
  );
  const outdatedFlag = String(
    pick(
      resolveDocValue(investmentDoc, [
        "signedContractOutdated",
        "requiresResign",
        "signedContract.isOutdated",
      ]),
      resolveDocValue(contractDoc, [
        "signedContractOutdated",
        "requiresResign",
        "signedContract.isOutdated",
      ]),
      resolveDocValue(selectedMessage, [
        "signedContractOutdated",
        "requiresResign",
        "signedContract.isOutdated",
      ]),
      ""
    )
  )
    .trim()
    .toLowerCase();
  const isSignedOutdatedByVersion =
    hasSignedContract &&
    Number.isFinite(originalVersion) &&
    Number.isFinite(signedForVersion) &&
    originalVersion > 0 &&
    signedForVersion > 0 &&
    signedForVersion < originalVersion;
  const originalUploadedAtDate = toDateSafe(originalUploadedAt);
  const signedUploadedAtDate = toDateSafe(signedUploadedAt);
  const isSignedOutdatedByTime =
    hasSignedContract &&
    !!originalUploadedAtDate &&
    !!signedUploadedAtDate &&
    originalUploadedAtDate.getTime() > signedUploadedAtDate.getTime();
  const isSignedOutdatedByFlag =
    outdatedFlag === "true" ||
    outdatedFlag === "1" ||
    outdatedFlag === "yes" ||
    outdatedFlag === "on";
  const isSignedOutdated =
    hasSignedContract &&
    (isSignedOutdatedByFlag ||
      isSignedOutdatedByVersion ||
      isSignedOutdatedByTime);

  const needsFreshSignedContract =
    storedContractStatus === "pending_signature" || isSignedOutdated;
  const hasCurrentSignedContract =
    hasSignedContract && !needsFreshSignedContract;
  const contractStatusValue = needsFreshSignedContract
    ? "pending_signature"
    : hasCurrentSignedContract
      ? ["approved", "under_review"].includes(storedContractStatus)
        ? storedContractStatus
        : "signed"
      : hasOriginalContract
        ? storedContractStatus && storedContractStatus !== "draft"
          ? storedContractStatus
          : "sent"
        : storedContractStatus || "draft";

  const needsNewSignedContract = CONTRACTS_DISABLED
    ? false
    : !hasCurrentSignedContract;
  const contractFollowupChipLabel =
    hasOriginalContract &&
      !hasCurrentSignedContract &&
      contractStatusValue !== "pending_signature"
      ? CLIENT_WORKFLOW_COPY.awaitingContractSignature
      : "";

  const canStartRequestReview =
    !!selectedMessage &&
    isSelectedInvestmentRequest &&
    canManageMessages &&
    myRole !== "client" &&
    !isLockedFinal &&
    !selectedMessage?.investmentId &&
    selectedRequestStatus === "pending";
  const canInitialApproveRequest =
    !!selectedMessage &&
    isSelectedInvestmentRequest &&
    canManageMessages &&
    myRole !== "client" &&
    !isLockedFinal &&
    !selectedMessage?.investmentId &&
    selectedRequestStatus === "reviewing";
  const canCreateInvestmentFromRequest =
    !!selectedMessage &&
    isSelectedInvestmentRequest &&
    canManageInvestments &&
    myRole !== "client" &&
    !isLockedFinal &&
    !selectedMessage?.investmentId &&
    selectedRequestStatus === "approved";
  const canVerifySignedContract =
    !!selectedMessage &&
    isSelectedInvestmentRequest &&
    canAdmin &&
    canManageInvestments &&
    !isLockedFinal &&
    !!selectedMessage?.investmentId &&
    ["signing", "signed"].includes(selectedInvestmentStatus) &&
    ["under_review", "signed"].includes(contractStatusValue) &&
    hasCurrentSignedContract &&
    !needsNewSignedContract;
  const canFinalize = CONTRACTS_DISABLED
    ? canManageInvestments &&
    isSelectedInvestmentRequest &&
    !!selectedMessage?.investmentId &&
    selectedInvestmentStatus === "signed"
    : isInvestment &&
    canManageInvestments &&
    !!selectedMessage?.investmentId &&
    selectedInvestmentStatus === "signed" &&
    contractStatusValue === "approved" &&
    hasCurrentSignedContract &&
    !needsNewSignedContract;

  const canApproveAndCreateInvestment = canCreateInvestmentFromRequest;

  const openSelectedProject = () => {
    if (!selectedProjectId) {
      toast.warning("لا يوجد مشروع مرتبط بهذا الطلب.");
      return;
    }
    window.location.href = `/admin/projects/${selectedProjectId}/edit`;
  };

  const openSelectedClientProfile = () => {
    const clientId = pick(
      selectedClient?.clientId,
      selectedMessage?.createdByUid,
      selectedMessage?.investorUid,
      selectedMessage?.userId,
      selectedMessage?.userSnapshot?.uid
    );

    if (!clientId) {
      toast.warning("لا يوجد حساب عميل مرتبط بهذا الطلب.");
      return;
    }

    window.location.href = `/admin/client-profile?id=${clientId}`;
  };

  const copySelectedRequestNumber = async () => {
    const value = requestNumber(selectedMessage);
    if (!value || value === "—") {
      toast.warning("لا يوجد رقم طلب متاح للنسخ.");
      return;
    }

    try {
      await navigator.clipboard.writeText(String(value));
      toast.success("تم نسخ رقم الطلب.");
    } catch (error) {
      console.error(error);
      toast.error("تعذر نسخ رقم الطلب.");
    }
  };

  const startRequestReview = async () => {
    if (!selectedMessage) return;
    if (!canStartRequestReview)
      return toast.error("لا تملك صلاحية بدء مراجعة الطلب.");
    await moveTo({
      status: "reviewing",
      stageRole: "review",
      handledAction: "mark_done",
      note: "تم بدء مراجعة طلب الاستثمار.",
    });
  };

  const initialApproveRequest = async () => {
    if (!selectedMessage) return;
    if (!canInitialApproveRequest)
      return toast.error("لا تملك صلاحية الموافقة الأولية على الطلب.");

    const ev = makeEvent({
      type: "request_initial_approved",
      title: "تمت الموافقة الأولية على الطلب",
      note: "اكتملت مراجعة الطلب وأصبح جاهزًا لإنشاء سجل الاستثمار.",
      ...myActor(user, myRole),
      meta: {
        messageId: selectedMessage.id,
        status: "approved",
        stageRole: "investment",
      },
    });

    try {
      await auditedUpdateDoc({
        ref: doc(db, REQUESTS_COL, selectedMessage.id),
        data: {
          status: "approved",
          stageRole: "investment" as StageRole,
          initialApprovedAt: serverTimestamp(),
          initialApprovedByUid: user?.uid || null,
          initialApprovedByEmail: user?.email || null,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(ev),
          ...buildHandledTrackingPatch("approve"),
          ...actionMeta(user, myRole),
        },
        action: AUDIT_ACTIONS.REQUEST_INITIAL_APPROVED,
        category: "request",
        entityType: "request",
        source: messagesAuditSource("initial_approve_request"),
        relatedIds: { requestId: selectedMessage.id },
        message: `Initially approved request ${selectedMessage.id}`,
      });

      await syncRelatedMessageTracking(selectedMessage.id, "approve");
      setSelectedMessage((prev: any) =>
        prev
          ? {
            ...prev,
            status: "approved",
            stageRole: "investment",
            events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
          }
          : prev
      );

      toast.success("تمت الموافقة الأولية على الطلب.");
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الطلب.");
    }
  };

  const {
    isArchiveMode,
    isActiveMode,
    archiveResultMeta,
    detailPrimaryAction,
    detailSecondaryAction,
    showDocumentsTab,
    canEditInternalNotes,
    hasStoredInternalNotes,
    showInternalNotesTab,
    showArchiveContractUpload,
    showStopInvestmentAdvancedAction,
    showReopenAdvancedAction,
    showAdvancedActions,
    availableDetailTabs,
    workflowSteps,
    workflowCurrentStepKey,
    workflowCurrentStepIndex,
    workflowCurrentStepMeta,
    workflowNextStepMeta,
    workflowPreferredTab,
    detailFlowSummary,
    detailHeaderMetrics,
  } = useMessagesWorkflowDisplayModel({
    selectedMessage,
    selectedRequestKind,
    selectedInterestReviewMeta,
    selectedStatusMeta,
    selectedStageMeta,
    selectedProjectTitle,
    selectedUpdatedAtValue,
    selectedRequestStatus,
    selectedInvestmentStatus,
    contractStatusValue,
    hasCurrentSignedContract,
    hasOriginalContract,
    hasSignedContract,
    isLockedFinal,
    isSelectedInvestmentRequest,
    isSelectedInterestRequest,
    canStartRequestReview,
    canInitialApproveRequest,
    canCreateInvestmentFromRequest,
    canVerifySignedContract,
    canFinalize,
    canAdmin,
    canManageInvestments,
    canManageMessages,
    myRole,
    internalNotes,
    hasOperationalInvestmentStarted,
    approveCreateBusy,
    finalizeBusy,
    activateInvestmentAfterApproval,
    verifySignedContract,
    approveRequestAndCreateInvestment,
    initialApproveRequest,
    startRequestReview,
    rejectInvestmentRequest,
    requestNumber,
    formatDateTimeAR,
    formatRequestTimeLabel,
  });

  const resolveDetailTab = (preferred: DetailSecondaryTabKey) => {
    if (availableDetailTabs.includes(preferred)) return preferred;
    return isArchiveMode && availableDetailTabs.includes("timeline")
      ? "timeline"
      : availableDetailTabs[0] || "context";
  };
  const openDetailTab = (preferred: DetailSecondaryTabKey) => {
    const nextTab = resolveDetailTab(preferred);
    setDetailSecondaryTab(current => (current === nextTab ? current : nextTab));
  };
  const detailGuidedPrimaryAction:
    | {
      key: string;
      label: string;
      onClick: () => void;
      disabled?: boolean;
      icon: ReactNode;
      className: string;
    }
    | null =
    !isActiveMode ||
      !isSelectedInvestmentRequest ||
      detailPrimaryAction ||
      workflowCurrentStepKey !== "contract_upload" ||
      !selectedMessage?.investmentId
      ? null
      : {
        key: "focus_documents",
        label:
          canAdmin && canManageInvestments ? "رفع العقد" : "فتح المستندات",
        onClick: () => openDetailTab("documents"),
        disabled: false,
        icon: <Upload className="h-4 w-4" />,
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-sky-700 hover:bg-sky-800`,
      };
  const detailVisiblePrimaryAction =
    detailPrimaryAction || detailGuidedPrimaryAction;
  const primaryContactLabel = selectedContactEmail
    ? "البريد الإلكتروني"
    : selectedContactPhone
      ? "رقم الجوال"
      : "وسيلة التواصل";
  const primaryContactValue = selectedContactEmail ? (
    <span dir="ltr" className="break-all">
      {selectedContactEmail}
    </span>
  ) : selectedContactPhone ? (
    <span dir="ltr">{selectedContactPhone}</span>
  ) : (
    "لا توجد وسيلة تواصل مسجلة داخل هذا الطلب."
  );

  useEffect(() => {
    if (!isRequestDetailsRouteActive || !selectedMessage?.id) return;

    setDetailSecondaryTab(current => {
      if (availableDetailTabs.includes(current)) return current;
      return isArchiveMode && availableDetailTabs.includes("timeline")
        ? "timeline"
        : availableDetailTabs[0] || "context";
    });
  }, [
    availableDetailTabs,
    isArchiveMode,
    isRequestDetailsRouteActive,
    selectedMessage?.id,
  ]);
  useEffect(() => {
    if (!isRequestDetailsRouteActive || !selectedMessage?.id || !workflowCurrentStepKey)
      return;

    const navigationKey = `${selectedMessage.id}:${workflowCurrentStepKey}:${workflowPreferredTab}:${isArchiveMode ? "archive" : "active"
      }`;
    if (workflowAutoNavigationRef.current === navigationKey) return;
    workflowAutoNavigationRef.current = navigationKey;

    const nextTab = availableDetailTabs.includes(workflowPreferredTab)
      ? workflowPreferredTab
      : isArchiveMode && availableDetailTabs.includes("timeline")
        ? "timeline"
        : availableDetailTabs[0] || "context";

    setDetailSecondaryTab(current => (current === nextTab ? current : nextTab));
  }, [
    availableDetailTabs,
    isArchiveMode,
    isRequestDetailsRouteActive,
    selectedMessage?.id,
    workflowCurrentStepKey,
    workflowPreferredTab,
  ]);

  /* =========================
     Render
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!isRequestDetailsRouteActive ? (
          <MessagesListView
            filtered={filtered}
            newRequests={newRequests}
            archivedRequests={archivedRequests}
            loading={loading}
            roleDocMissing={roleDocMissing}
            myRole={myRole}
            user={user}
            stats={stats}
            clientSourceCounters={clientSourceCounters}
            requestKindCounters={requestKindCounters}
            statusCounters={statusCounters}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            view={view}
            setView={setView}
            requestKindView={requestKindView}
            setRequestKindView={setRequestKindView}
            navigateToRequestDetails={navigateToRequestDetails}
            moneySAR={moneySAR}
          />
        ) : null}

        {isRequestDetailsRouteActive ? (
          <MessagesDetailView
            selectedMessage={selectedMessage}
            loading={loading}
            selectedStatusMeta={selectedStatusMeta}
            isSelectedInterestRequest={isSelectedInterestRequest}
            isSelectedInvestmentRequest={isSelectedInvestmentRequest}
            detailHeaderMetrics={detailHeaderMetrics}
            navigateToMessagesList={navigateToMessagesList}
            copySelectedRequestNumber={copySelectedRequestNumber}
            workflowSteps={workflowSteps}
            workflowCurrentStepIndex={workflowCurrentStepIndex}
            workflowCurrentStepMeta={workflowCurrentStepMeta}
            workflowNextStepMeta={workflowNextStepMeta}
            selectedRequestStatus={selectedRequestStatus}
            isArchiveMode={isArchiveMode}
            detailSecondaryTab={detailSecondaryTab}
            setDetailSecondaryTab={setDetailSecondaryTab}
            resolveDetailTab={resolveDetailTab}
            openDetailTab={openDetailTab}
            detailFlowSummary={detailFlowSummary}
            isActiveMode={isActiveMode}
            selectedTrackingMeta={selectedTrackingMeta}
            selectedTrackingSlaMeta={selectedTrackingSlaMeta}
            selectedStageMeta={selectedStageMeta}
            detailVisiblePrimaryAction={detailVisiblePrimaryAction}
            detailSecondaryAction={detailSecondaryAction}
            selectedInterestReviewMeta={selectedInterestReviewMeta}
            selectedAmount={selectedAmount}
            selectedLastActor={selectedLastActor}
            archiveResultMeta={archiveResultMeta}
            selectedUpdatedAtValue={selectedUpdatedAtValue}
            formatDateTimeAR={formatDateTimeAR}
            formatRequestTimeLabel={formatRequestTimeLabel}
            moneySAR={moneySAR}
            selectedClient={selectedClient}
            primaryContactLabel={primaryContactLabel}
            primaryContactValue={primaryContactValue}
            openSelectedClientProfile={openSelectedClientProfile}
            selectedProjectTitle={selectedProjectTitle}
            selectedRemaining={selectedRemaining}
            selectedAmountExceeded={selectedAmountExceeded}
            openSelectedProject={openSelectedProject}
            contractStatusValue={contractStatusValue}
            contractFollowupChipLabel={contractFollowupChipLabel}
            hasOriginalContract={hasOriginalContract}
            hasCurrentSignedContract={hasCurrentSignedContract}
            originalContractFileName={originalContractFileName}
            originalContractViewUrl={originalContractViewUrl}
            originalContractDownloadUrl={originalContractDownloadUrl}
            needsFreshSignedContract={needsFreshSignedContract}
            signedContractFileName={signedContractFileName}
            signedContractViewUrl={signedContractViewUrl}
            signedContractDownloadUrl={signedContractDownloadUrl}
            draftFile={draftFile}
            setDraftFile={setDraftFile}
            contractBusy={contractBusy}
            canAdmin={canAdmin}
            createContractForInvestment={createContractForInvestment}
            showDocumentsTab={showDocumentsTab}
            showInternalNotesTab={showInternalNotesTab}
            canEditInternalNotes={canEditInternalNotes}
            internalNotes={internalNotes}
            setInternalNotes={setInternalNotes}
            handleSaveNotesOnly={handleSaveNotesOnly}
            hasStoredInternalNotes={hasStoredInternalNotes}
            selectedRequestSummary={selectedRequestSummary}
            selectedRequestKind={selectedRequestKind}
            selectedTimelineEvents={selectedTimelineEvents}
            showAdvancedActions={showAdvancedActions}
            showReopenAdvancedAction={showReopenAdvancedAction}
            reopenBusy={reopenBusy}
            myRole={myRole}
            canManageMessages={canManageMessages}
            reopenMessage={reopenMessage}
            showArchiveContractUpload={showArchiveContractUpload}
            showStopInvestmentAdvancedAction={showStopInvestmentAdvancedAction}
            isSelectedInvestmentStoppedEarly={isSelectedInvestmentStoppedEarly}
            canEditFinancial={canEditFinancial}
            investmentDoc={investmentDoc}
            openStopInvestmentDialog={openStopInvestmentDialog}
          />
        ) : null}

        <Dialog
          open={stopInvestmentDialogOpen}
          onOpenChange={setStopInvestmentDialogOpen}
        >
          <DialogContent className="flex h-[90vh] w-[96vw] max-w-[1100px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white p-0">
            <DialogHeader className="space-y-3 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-8 py-7 text-right [&>h2]:sr-only">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 text-right">
                  <div className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-rose-700">
                    {isSelectedInvestmentStoppedEarly
                      ? "استثمار موقوف"
                      : "طلب إيقاف"}
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-semibold tracking-tight text-slate-950">
                      {isSelectedInvestmentStoppedEarly
                        ? "بيانات إيقاف الاستثمار"
                        : "إيقاف الاستثمار بطلب العميل"}
                    </div>
                    <p className="max-w-3xl text-sm leading-7 text-slate-500">
                      {isSelectedInvestmentStoppedEarly
                        ? "هذه النافذة تعرض بيانات الإيقاف المبكر المسجلة سابقًا، مع إمكانية إرفاق مستندات التسوية من نفس الصفحة."
                        : "نفّذ إيقاف الاستثمار من هنا مباشرة بدون الانتقال إلى صفحة أخرى، مع معاينة مدة الاستثمار والتسوية النهائية قبل التأكيد."}
                    </p>
                  </div>
                </div>
                <DialogTitle>
                  {isSelectedInvestmentStoppedEarly
                    ? "بيانات إيقاف الاستثمار"
                    : "إيقاف الاستثمار بطلب العميل"}
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto bg-slate-50/60 px-8 py-7">
              <div className="space-y-6">
                <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                        تفاصيل الإيقاف
                      </div>
                      <div className="mt-2 text-base font-semibold text-slate-900">
                        {String(
                          investmentDoc?.projectTitle ||
                            getProjectTitle(
                              pick(
                                investmentDoc?.projectId,
                                selectedMessage?.projectId,
                                selectedMessage?.project_id
                              )
                            )
                        ).trim() || "استثمار"}
                      </div>
                      <p className="mt-2 text-sm leading-7 text-slate-500">
                        أدخل تاريخ الإيقاف والملاحظة الإدارية في نفس هذه الصفحة، وسيتم احتساب التسوية المعتمدة قبل التنفيذ النهائي.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                      <div className="text-xs font-semibold text-slate-500">
                        رقم الاستثمار
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {String(
                          investmentDoc?.id || selectedMessage?.investmentId || "—"
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-3">
                      <Label>تاريخ الإيقاف الفعلي</Label>
                      <Input
                        className="h-12 rounded-xl bg-white"
                        type="text"
                        value={stopCloseDate}
                        inputMode="numeric"
                        placeholder="YYYY-MM-DD"
                        disabled={isSelectedInvestmentStoppedEarly}
                        onChange={(e) => setStopCloseDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-3">
                      <Label>منفذ الإجراء الإداري</Label>
                      <Input
                        className="h-12 rounded-xl bg-slate-50"
                        value={String(
                          user?.email || user?.uid || "غير متوفر"
                        )}
                        disabled
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>سبب الإيقاف / الملاحظة الإدارية</Label>
                    <Textarea
                      className="min-h-[180px] rounded-2xl bg-white px-4 py-3 leading-7"
                      value={stopReason}
                      disabled={isSelectedInvestmentStoppedEarly}
                      onChange={(e) => setStopReason(e.target.value)}
                      placeholder="مثال: طلب العميل الخروج المبكر وتسوية الاستثمار حتى تاريخ محدد"
                      rows={7}
                    />
                  </div>

                  {stopSettlementPreviewState.error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-800">
                      {stopSettlementPreviewState.error}
                    </div>
                  ) : null}

                  {stopPreviewExceedsPlannedEnd ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-800">
                      تاريخ الإيقاف يجب أن يكون قبل تاريخ نهاية الاستثمار المخطط.
                    </div>
                  ) : null}
                </section>

                {settlementPreview ? (
                  <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                          التسوية
                        </div>
                        <div className="mt-2 text-base font-semibold text-slate-900">
                          ملخص التسوية
                        </div>
                        <p className="mt-2 text-sm leading-7 text-slate-500">
                          هذه القيم مشتقة من منطق التسوية المركزي الحالي وتُثبّت داخل سجل الاستثمار عند تنفيذ الإيقاف.
                        </p>
                      </div>
                      <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                        {settlementPreview.policyLabel || "إيقاف مبكر"}
                      </Badge>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="flex min-h-[136px] flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-4 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500">
                          تاريخ الدخول
                        </div>
                        <div className="mt-4 text-base font-semibold leading-7 text-slate-900">
                          {formatDetailedDateTime(
                            settlementPreview.investmentStartDate
                          )}
                        </div>
                      </div>
                      <div className="flex min-h-[136px] flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-4 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500">
                          تاريخ الخروج
                        </div>
                        <div className="mt-4 text-base font-semibold leading-7 text-slate-900">
                          {formatDetailedDateTime(
                            settlementPreview.investmentStopDate
                          )}
                        </div>
                      </div>
                      <div className="flex min-h-[136px] flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-4 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500">
                          المدة الفعلية
                        </div>
                        <div className="mt-4 text-base font-semibold leading-7 text-slate-900">
                          {formatNumberEN(settlementPreview.investedDays)} يوم
                        </div>
                      </div>
                      <div className="flex min-h-[136px] flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-4 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500">
                          أصل المبلغ
                        </div>
                        <div className="mt-4 text-base font-semibold leading-7 text-slate-900">
                          {formatCurrencyEN(settlementPreview.principalAmount)}
                        </div>
                      </div>
                      <div className="flex min-h-[136px] flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/90 px-5 py-4 shadow-sm">
                        <div className="text-xs font-semibold text-emerald-700">
                          الربح المستحق
                        </div>
                        <div className="mt-4 text-base font-semibold leading-7 text-emerald-800">
                          {formatCurrencyEN(
                            settlementPreview.calculatedProfit
                          )}
                        </div>
                      </div>
                      <div className="flex min-h-[136px] flex-col justify-between rounded-2xl border border-sky-200 bg-sky-50/90 px-5 py-4 shadow-sm">
                        <div className="text-xs font-semibold text-sky-700">
                          إجمالي المستحق
                        </div>
                        <div className="mt-4 text-base font-semibold leading-7 text-sky-800">
                          {formatCurrencyEN(settlementPreview.totalPayout)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                            طريقة الاحتساب
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">
                            عرض منظم للمراحل التي بُنيت عليها المعادلة
                          </div>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          المعادلة المعتمدة
                        </Badge>
                      </div>

                      {humanReadableFormula ? (
                        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                          <div className="text-sm font-semibold leading-7 text-emerald-900">
                            {humanReadableFormula}
                          </div>
                          <div className="mt-2 text-base font-bold text-emerald-950">
                            = {humanReadableProfitResult}
                          </div>
                        </div>
                      ) : null}

                      {settlementFormulaParts.length > 0 ? (
                        <div className="mt-4 grid gap-3">
                          {settlementFormulaParts.map((part, index) => (
                            <div
                              key={`${part}-${index}`}
                              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                                {index + 1}
                              </div>
                              <div className="min-w-0 flex-1 break-words text-sm leading-7 text-slate-700">
                                {part}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                          لا توجد صيغة محفوظة حاليًا.
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}

                <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                        المستندات
                      </div>
                      <div className="mt-2 text-base font-semibold text-slate-900">
                        مستند التسوية / مستندات الإيقاف
                      </div>
                      <p className="mt-2 text-sm leading-7 text-slate-500">
                        يمكن إرفاق ملف PDF للتسوية النهائية أو أي مستند داعم متعلق بإيقاف الاستثمار.
                      </p>
                    </div>

                    {latestSettlementDocument ? (
                      <div className="flex flex-wrap gap-2">
                        {latestSettlementDocumentViewUrl ? (
                          <a
                            href={latestSettlementDocumentViewUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 rounded-xl px-4"
                            >
                              <Eye className="ml-1 h-4 w-4" />
                              عرض آخر ملف
                            </Button>
                          </a>
                        ) : null}
                        {latestSettlementDocumentDownloadUrl ? (
                          <a
                            href={latestSettlementDocumentDownloadUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 rounded-xl px-4"
                            >
                              <Download className="ml-1 h-4 w-4" />
                              تنزيل
                            </Button>
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <ContractFilePicker
                      buttonLabel="اختيار ملف التسوية (PDF)"
                      file={settlementDocumentFile}
                      onFileChange={setSettlementDocumentFile}
                      disabled={!canEditFinancial || settlementDocumentBusy}
                      panelClassName="rounded-2xl border-slate-200 bg-slate-50/80 px-5 py-4"
                      buttonClassName="h-11 rounded-xl px-5 text-sm font-semibold"
                      fileNameClassName="text-base font-semibold text-slate-900"
                      helperTextClassName="text-sm leading-6"
                    />

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3">
                        <div className="text-xs font-semibold text-slate-500">
                          اسم الملف المحدد
                        </div>
                        <div className="mt-2 break-words text-sm font-semibold text-slate-900">
                          {settlementDocumentFile?.name ||
                            "لم يتم اختيار ملف جديد بعد"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3">
                        <div className="text-xs font-semibold text-slate-500">
                          آخر ملف محفوظ
                        </div>
                        <div className="mt-2 break-words text-sm font-semibold text-slate-900">
                          {latestSettlementDocument?.fileName ||
                            "لا يوجد ملف محفوظ حتى الآن"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs font-semibold text-slate-500">
                          حالة المستندات
                        </div>
                        <div className="text-sm leading-7 text-slate-600">
                          {settlementDocumentsLoading
                            ? "جارٍ تحميل مستندات التسوية المرتبطة بهذا الاستثمار..."
                            : latestSettlementDocument
                            ? `آخر ملف محفوظ: ${
                                latestSettlementDocument.fileName ||
                                "مستند تسوية"
                              }`
                            : "لا يوجد مستند تسوية محفوظ حتى الآن."}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-200 bg-white px-8 py-5 sm:justify-between">
              <Button
                variant="outline"
                className="h-11 rounded-xl px-5"
                onClick={() => setStopInvestmentDialogOpen(false)}
              >
                {isSelectedInvestmentStoppedEarly ? "إغلاق" : "إلغاء"}
              </Button>
              {isSelectedInvestmentStoppedEarly ? (
                <Button
                  variant="outline"
                  className="h-11 rounded-xl px-5"
                  disabled={
                    !canEditFinancial ||
                    !settlementDocumentFile ||
                    settlementDocumentBusy
                  }
                  onClick={uploadSettlementAttachment}
                >
                  {settlementDocumentBusy ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="ml-2 h-4 w-4" />
                  )}
                  رفع مستند التسوية
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="h-11 rounded-xl px-5"
                  disabled={!canConfirmStopInvestment}
                  onClick={closeInvestmentEarlyTx}
                >
                  تأكيد إيقاف الاستثمار
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Return dialog */}
        <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>إرجاع العقد للتعديل</DialogTitle>
            </DialogHeader>

            <div className="space-y-2">
              <Label>ملاحظة الإرجاع</Label>
              <Textarea
                value={returnNote}
                onChange={e => setReturnNote(e.target.value)}
                placeholder="اكتب سبب الإرجاع."
                className="min-h-[120px]"
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setReturnDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={returnContractWithNote}
              >
                إرسال
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

