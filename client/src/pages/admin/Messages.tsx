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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  MessageSquare,
  Mail,
  Phone,
  Eye,
  Copy,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  PenLine,
  ShieldCheck,
  Clock3,
  Building2,
  AlertTriangle,
  ExternalLink,
  Download,
  Search,
  CalendarDays,
  Wallet,
  RefreshCw,
  ArrowRight,
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
type DetailSecondaryTabKey =
  | "context"
  | "timeline"
  | "documents"
  | "internal_notes";
type WorkflowStepKey =
  | "review_start"
  | "investment_creation"
  | "contract_upload"
  | "request_completion";
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
const DETAIL_OUTLINE_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 border border-slate-200 bg-white text-slate-700 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.35)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950`;
const DETAIL_LIGHT_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 bg-slate-950 text-white shadow-[0_18px_38px_-26px_rgba(15,23,42,0.48)] hover:bg-[#10203a]`;
const DETAIL_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.3)]`;
const DETAIL_DANGER_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 bg-rose-600 text-white shadow-[0_18px_38px_-24px_rgba(225,29,72,0.38)] hover:bg-rose-500`;
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

    const target = toNum(p?.targetAmount);
    const current = toNum(p?.currentAmount);
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

      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));

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
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
        }));
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

  const requestRows = useMemo(() => {
    const rows = normalized.map(message => {
      const client = resolveRequestClient(message, userIdentityIndex);
      const projectId = pick(
        message?.projectId,
        message?.project_id,
        message?.project?.id
      );
      const projectStatus = pick(
        message?.projectStatus,
        message?.projectSnapshot?.status,
        message?.project?.status,
        projectsMap[String(projectId || "")]?.status
      );
      const amount =
        toNum(message?.approvedAmount) ||
        toNum(message?.amount) ||
        toNum(message?.requestedAmount) ||
        toNum(message?.estimatedAmount) ||
        0;
      const remaining = getProjectRemaining(projectId);
      const statusMeta = getRequestStatusMeta(message.status);
      const stageMeta = getRequestStageMeta(message.stageRole);
      const requestKind = getRequestKindMeta({
        type: pick(message?.type, message?.requestType),
        source: message?.source,
        projectStatus,
        amount,
      });
      const trackingMeta = getRequestTrackingMeta(message, requestKind.key);
      const trackingSlaMeta = getRequestTrackingSlaMeta(
        message,
        requestKind.key
      );
      const trackingPriority = getRequestTrackingPriority(
        message,
        requestKind.key
      );
      const interestReviewMeta =
        requestKind.key === "interest" ? getInterestTrackingMeta(message) : null;
      const requestDateValue = toDateSafe(
        message.createdAt ||
        message.created_at ||
        message.submittedAt ||
        message.timestamp
      );
      const updatedAtValue = getLastUpdatedAtValue(message);
      const projectTitle = getProjectTitle(projectId);

      return {
        ...message,
        client,
        projectId,
        projectTitle,
        amount,
        remaining,
        exceeded: remaining != null ? amount > remaining : false,
        requestIdLabel: requestNumber(message),
        requestDateValue,
        requestDateLabel: formatDateTimeAR(requestDateValue),
        requestTimeLabel: formatRequestTimeLabel(requestDateValue),
        updatedAtValue,
        updatedAtLabel: formatDateTimeAR(updatedAtValue),
        updatedTimeLabel: formatRequestTimeLabel(
          updatedAtValue || requestDateValue
        ),
        touchedBy: lastTouchedBy(message),
        trackingMeta,
        trackingSlaMeta,
        trackingPriority,
        statusMeta,
        stageMeta,
        requestKind,
        interestReviewMeta,
        summary: getRequestSummary(message),
        searchIndex: normalizeSearchValue(
          client.clientName,
          client.clientEmail,
          client.clientPhone,
          projectTitle,
          requestNumber(message),
          statusMeta.label,
          trackingMeta.label,
          trackingSlaMeta?.label,
          stageMeta.label,
          client.sourceLabel,
          requestKind.label,
          requestKind.shortLabel,
          interestReviewMeta?.label
        ),
      };
    });

    return rows.sort((a, b) => {
      const rankDiff = (a.trackingPriority || 0) - (b.trackingPriority || 0);
      if (rankDiff !== 0) return rankDiff;

      const aTime =
        a.updatedAtValue instanceof Date ? a.updatedAtValue.getTime() : 0;
      const bTime =
        b.updatedAtValue instanceof Date ? b.updatedAtValue.getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;

      const aCreated =
        a.requestDateValue instanceof Date ? a.requestDateValue.getTime() : 0;
      const bCreated =
        b.requestDateValue instanceof Date ? b.requestDateValue.getTime() : 0;
      return bCreated - aCreated;
    });
  }, [normalized, userIdentityIndex, projectsMap]);

  const filtered = useMemo(() => {
    const matchesView = (message: any) => {
      if (view === "all") return true;
      if (view === "new" || view === "open") {
        return isNewRequestRecord(message);
      }
      if (view === "archived" || view === "completed") {
        return isArchivedRequestRecord(message);
      }
      if (view === "rejected") {
        return normalizeRequestStatus(message.status) === "rejected";
      }
      return true;
    };

    return requestRows.filter(message => {
      if (!matchesView(message)) return false;
      if (
        requestKindView !== "all" &&
        message.requestKind?.key !== requestKindView
      ) {
        return false;
      }
      if (!deferredSearchQuery) return true;
      return message.searchIndex.includes(deferredSearchQuery);
    });
  }, [deferredSearchQuery, requestKindView, requestRows, view]);

  const newRequests = useMemo(
    () => filtered.filter(message => isNewRequestRecord(message)),
    [filtered]
  );

  const archivedRequests = useMemo(
    () => filtered.filter(message => isArchivedRequestRecord(message)),
    [filtered]
  );

  const stats = useMemo(() => {
    const all = requestRows;
    const nextNew = all.filter(message => isNewRequestRecord(message));
    const archived = all.filter(message => isArchivedRequestRecord(message));
    const rejected = all.filter(
      message => normalizeRequestStatus(message.status) === "rejected"
    );

    return {
      all: all.length,
      new: nextNew.length,
      archived: archived.length,
      open: nextNew.length,
      completed: archived.length,
      rejected: rejected.length,
      newInvestment: nextNew.filter(
        message => message.requestKind?.key === "investment"
      ).length,
      newInterest: nextNew.filter(
        message => message.requestKind?.key === "interest"
      ).length,
    };
  }, [requestRows]);

  const statusCounters = useMemo(
    () => ({
      pending: requestRows.filter(message => message.status === "pending")
        .length,
      reviewing: requestRows.filter(message => message.status === "reviewing")
        .length,
      approved: requestRows.filter(message => message.status === "approved")
        .length,
      completed: requestRows.filter(message =>
        ["completed", "closed"].includes(String(message.status || ""))
      ).length,
    }),
    [requestRows]
  );

  const clientSourceCounters = useMemo(
    () => ({
      live: requestRows.filter(
        message => message.client.sourceKey === "live_user"
      ).length,
      requestSnapshot: requestRows.filter(
        message => message.client.sourceKey === "request_snapshot"
      ).length,
      unknown: requestRows.filter(
        message => message.client.sourceKey === "unknown"
      ).length,
    }),
    [requestRows]
  );

  const requestKindCounters = useMemo(
    () => ({
      investment: requestRows.filter(
        message => message.requestKind?.key === "investment"
      ).length,
      interest: requestRows.filter(
        message => message.requestKind?.key === "interest"
      ).length,
    }),
    [requestRows]
  );

  const getRequestViewLabel = (viewKey: string) => {
    if (viewKey === "all") return "الكل";
    if (viewKey === "new" || viewKey === "open") return "الجديدة";
    if (viewKey === "archived" || viewKey === "completed") {
      return "القديمة / المنتهية";
    }
    if (viewKey === "rejected") return "المرفوضة";
    return viewKey;
  };

  const renderRequestCard = (request: any) => {
    if (request.requestKind?.key === "interest") {
      const reviewMeta =
        request.interestReviewMeta || getInterestTrackingMeta(request);
      const trackingMeta =
        request.trackingMeta || getRequestTrackingMeta(request, "interest");
      const trackingSlaMeta =
        request.trackingSlaMeta || getRequestTrackingSlaMeta(request, "interest");
      const narrative = request.summary || reviewMeta.helperText;
      const projectTitle =
        request.projectTitle && request.projectTitle !== "—"
          ? request.projectTitle
          : "لا يوجد مشروع مرتبط";

      return (
        <article
          key={request.id}
          className={cn(
            "group relative flex h-full flex-col overflow-hidden rounded-[22px] border p-4 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.32)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-32px_rgba(15,23,42,0.26)]",
            reviewMeta.cardClass
          )}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-1.5",
              reviewMeta.accent
            )}
          />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-slate-400">
                <span>إشارة اهتمام #{request.requestIdLabel}</span>
                <Badge
                  className={cn(
                    "border px-2.5 py-0.5 text-[10px] font-semibold shadow-none",
                    request.requestKind.badgeTone
                  )}
                >
                  {request.requestKind.label}
                </Badge>
                {request.client.sourceKey !== "live_user" ? (
                  <Badge
                    className={cn(
                      "border px-2 py-0.5 text-[10px] font-semibold shadow-none",
                      request.client.sourceTone
                    )}
                  >
                    {request.client.sourceLabel}
                  </Badge>
                ) : null}
              </div>

              <div>
                <h3 className="break-words text-[15px] font-semibold leading-6 text-slate-950">
                  {request.client.clientName}
                </h3>

                <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
                  <span className="inline-flex items-center rounded-full bg-amber-100/80 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                    طلب اهتمام
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="leading-6 text-slate-500">
                    {request.requestTimeLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge
                className={cn(
                  "border px-3 py-1 text-[11px] font-semibold shadow-none",
                  trackingMeta.tone
                )}
              >
                {trackingMeta.label}
              </Badge>
              {trackingSlaMeta ? (
                <Badge
                  className={cn(
                    "border px-2.5 py-0.5 text-[10px] font-semibold shadow-none",
                    trackingSlaMeta.className
                  )}
                >
                  {trackingSlaMeta.label}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-amber-200/80 bg-white/80 p-3">
            <div className="flex items-start gap-2 text-[13px] text-slate-700">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span className="min-w-0 break-words font-medium leading-6">
                {projectTitle}
              </span>
            </div>

            <div className="mt-3 rounded-[16px] border border-amber-200/70 bg-amber-50/70 px-3 py-3 text-sm leading-7 text-amber-950">
              {narrative}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <RequestCardMetric
              label="البريد أو الجوال"
              value={
                request.client.clientEmail ||
                request.client.clientPhone ||
                "—"
              }
              icon={<Mail className="h-3.5 w-3.5" />}
            />
            <RequestCardMetric
              label="وقت الإرسال"
              value={request.requestDateLabel || "—"}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
            />
            <RequestCardMetric
              label="الحالة"
              value={reviewMeta.label}
              icon={<Eye className="h-3.5 w-3.5" />}
              strong
            />
            <RequestCardMetric
              label="رقم الطلب"
              value={request.requestIdLabel}
              mono
            />
          </div>

          <div className="mt-3 rounded-[18px] border border-amber-200/70 bg-amber-50/45 px-3 py-3 text-sm leading-7 text-slate-700">
            {reviewMeta.helperText}
          </div>

          <div className="mt-auto pt-4">
            <Button
              className={cn(
                "h-10 w-full gap-2 rounded-2xl",
                request.requestKind.ctaClass
              )}
              onClick={() => navigateToRequestDetails(request.id)}
            >
              <Eye className="h-4 w-4" />
              {request.requestKind.ctaLabel}
            </Button>
          </div>
        </article>
      );
    }

    const hasLinkedInvestment = !!request.investmentId;
    const isInvestmentRequest = request.requestKind?.key === "investment";
    const progressBadgeLabel = isInvestmentRequest
      ? hasLinkedInvestment
        ? "تم إنشاء الاستثمار"
        : "بانتظار الإنشاء"
      : "متابعة تمهيدية";
    const progressBadgeTone = isInvestmentRequest
      ? hasLinkedInvestment
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-100 text-slate-600"
      : "border-amber-200 bg-amber-50 text-amber-800";
    const narrative = request.summary || request.requestKind.helperText;
    const lastActor = resolveLastActorMeta(
      request,
      userIdentityIndex,
      request.client
    );
    const trackingMeta =
      request.trackingMeta ||
      getRequestTrackingMeta(request, request.requestKind?.key);
    const trackingSlaMeta =
      request.trackingSlaMeta ||
      getRequestTrackingSlaMeta(request, request.requestKind?.key);

    return (
      <article
        key={request.id}
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-[22px] border p-4 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.38)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-32px_rgba(15,23,42,0.36)]",
          getRequestCardStatusClass(request.status)
        )}
      >
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-1.5",
            request.statusMeta.accent
          )}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-slate-400">
              <span>طلب #{request.requestIdLabel}</span>
              <Badge
                className={cn(
                  "border px-2.5 py-0.5 text-[10px] font-semibold shadow-none",
                  request.requestKind.badgeTone
                )}
              >
                {request.requestKind.label}
              </Badge>
              {request.client.sourceKey !== "live_user" ? (
                <Badge
                  className={cn(
                    "border px-2 py-0.5 text-[10px] font-semibold shadow-none",
                    request.client.sourceTone
                  )}
                >
                  {request.client.sourceLabel}
                </Badge>
              ) : null}
            </div>

            <div>
              <h3 className="break-words text-[15px] font-semibold leading-6 text-slate-950">
                {request.client.clientName}
              </h3>

              <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {request.client.clientRoleLabel}
                </span>
                <span className="text-slate-300">•</span>
                <span className="leading-6 text-slate-500">
                  {request.requestTimeLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                trackingMeta.tone
              )}
            >
              {trackingMeta.label}
            </Badge>
            {trackingSlaMeta ? (
              <Badge
                className={cn(
                  "border px-2.5 py-0.5 text-[10px] font-semibold shadow-none",
                  trackingSlaMeta.className
                )}
              >
                {trackingSlaMeta.label}
              </Badge>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "mt-4 rounded-[18px] border p-3",
            request.requestKind.projectPanelClass
          )}
        >
          <div className="flex items-start gap-2 text-[13px] text-slate-700">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 break-words font-medium leading-6">
              {request.projectTitle}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                request.stageMeta.tone
              )}
            >
              {request.stageMeta.label}
            </Badge>
            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                request.statusMeta.tone
              )}
            >
              {request.statusMeta.label}
            </Badge>
            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                progressBadgeTone
              )}
            >
              {progressBadgeLabel}
            </Badge>
          </div>

          <div
            className={cn(
              "mt-3 rounded-[16px] px-3 py-3 text-sm leading-7",
              request.requestKind.helperClass
            )}
          >
            {narrative}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <RequestCardMetric
            label={request.requestKind.metricLabel}
            value={
              isInvestmentRequest
                ? moneySAR(request.amount)
                : request.requestKind.metricValue
            }
            icon={
              isInvestmentRequest ? (
                <Wallet className="h-3.5 w-3.5" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )
            }
            strong={isInvestmentRequest}
          />
          <RequestCardMetric
            label="تاريخ الطلب"
            value={request.requestDateLabel || "—"}
            icon={<CalendarDays className="h-3.5 w-3.5" />}
          />
          <RequestCardMetric
            label="آخر تحديث"
            value={request.updatedAtLabel || "—"}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          />
          <RequestCardMetric
            label="رقم الطلب"
            value={request.requestIdLabel}
            mono
          />
        </div>

        <div className="mt-3 rounded-[18px] border border-slate-200/70 bg-slate-50/60 px-3 py-3">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">
            آخر من عدّل
          </div>

          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lastActor.name}
          </div>

          <div className="mt-1 text-xs font-medium text-slate-500">
            {lastActor.roleLabel}
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            <span>{lastActor.relativeTimeLabel}</span>
          </div>

          <div className="mt-1 text-xs text-slate-500">
            التاريخ {lastActor.dateLabel}
          </div>
        </div>

        <div className="mt-auto pt-4">
          <Button
            className={cn(
              "h-10 w-full gap-2 rounded-2xl",
              request.requestKind.ctaClass
            )}
            onClick={() => navigateToRequestDetails(request.id)}
          >
            <Eye className="h-4 w-4" />
            {request.requestKind.ctaLabel}
          </Button>
        </div>
      </article>
    );
  };

  const selectedClient = useMemo(
    () =>
      selectedMessage
        ? resolveRequestClient(selectedMessage, userIdentityIndex)
        : null,
    [selectedMessage, userIdentityIndex]
  );

  const selectedRequestKind = useMemo(() => {
    if (!selectedMessage) return null;

    const selectedProjectStatus = pick(
      selectedMessage?.projectStatus,
      selectedMessage?.projectSnapshot?.status,
      selectedMessage?.project?.status,
      projectsMap[String(
        pick(
          selectedMessage?.projectId,
          selectedMessage?.project_id,
          selectedMessage?.project?.id
        ) || ""
      )]?.status
    );
    const selectedAmount =
      toNum(selectedMessage?.approvedAmount) ||
      toNum(selectedMessage?.amount) ||
      toNum(selectedMessage?.requestedAmount) ||
      toNum(selectedMessage?.estimatedAmount) ||
      0;

    return getRequestKindMeta({
      type: pick(selectedMessage?.type, selectedMessage?.requestType),
      source: selectedMessage?.source,
      projectStatus: selectedProjectStatus,
      amount: selectedAmount,
    });
  }, [projectsMap, selectedMessage]);

  const selectedInterestReviewMeta = useMemo(
    () =>
      selectedRequestKind?.key === "interest" && selectedMessage
        ? getInterestTrackingMeta(selectedMessage)
        : null,
    [selectedMessage, selectedRequestKind]
  );

  const selectedProjectId = pick(
    selectedMessage?.projectId,
    selectedMessage?.project_id,
    selectedMessage?.project?.id
  );
  const selectedProjectTitle = getProjectTitle(selectedProjectId);
  const selectedAmount =
    toNum(selectedMessage?.approvedAmount) ||
    toNum(selectedMessage?.amount) ||
    toNum(selectedMessage?.requestedAmount) ||
    toNum(selectedMessage?.estimatedAmount) ||
    0;
  const selectedRemaining = getProjectRemaining(selectedProjectId);
  const selectedAmountExceeded =
    selectedRemaining != null ? selectedAmount > selectedRemaining : false;
  const selectedRequestSummary = getRequestSummary(selectedMessage);
  const selectedContactEmail =
    selectedClient?.clientEmail || getClientEmail(selectedMessage);
  const selectedContactPhone =
    selectedClient?.clientPhone || getClientPhone(selectedMessage);
  const selectedCreatedAtValue = toDateSafe(
    selectedMessage?.createdAt ||
    selectedMessage?.created_at ||
    selectedMessage?.submittedAt ||
    selectedMessage?.timestamp
  );
  const selectedUpdatedAtValue = getLastUpdatedAtValue(selectedMessage);
  const selectedTrackingMeta = useMemo(
    () =>
      selectedMessage
        ? getRequestTrackingMeta(selectedMessage, selectedRequestKind?.key)
        : null,
    [selectedMessage, selectedRequestKind?.key]
  );
  const selectedTrackingSlaMeta = useMemo(
    () =>
      selectedMessage
        ? getRequestTrackingSlaMeta(selectedMessage, selectedRequestKind?.key)
        : null,
    [selectedMessage, selectedRequestKind?.key]
  );

  const selectedStatusMeta = useMemo(() => {
    if (!selectedMessage) return null;
    if (selectedRequestKind?.key === "interest") {
      return {
        label: selectedInterestReviewMeta?.label || "جديد",
        tone:
          selectedInterestReviewMeta?.tone ||
          "border-amber-200 bg-amber-50 text-amber-800",
        accent: selectedInterestReviewMeta?.accent || "bg-amber-500",
      };
    }
    return getRequestStatusMeta(selectedMessage.status);
  }, [selectedInterestReviewMeta, selectedMessage, selectedRequestKind]);

  const selectedStageMeta = useMemo(
    () =>
      selectedMessage ? getRequestStageMeta(selectedMessage.stageRole) : null,
    [selectedMessage]
  );

  const selectedLastActor = useMemo(
    () =>
      selectedMessage && selectedClient
        ? resolveLastActorMeta(selectedMessage, userIdentityIndex, selectedClient)
        : null,
    [selectedClient, selectedMessage, userIdentityIndex]
  );

  const selectedTimelineEvents = useMemo(
    () =>
      selectedMessage && selectedClient && selectedRequestKind
        ? buildRequestTimelineEvents({
          request: selectedMessage,
          userIdentityIndex,
          client: selectedClient,
          requestKind: selectedRequestKind.key,
        })
        : [],
    [selectedClient, selectedMessage, selectedRequestKind, userIdentityIndex]
  );

  /* =========================
    flags
  ========================= */
  const isSelectedInvestmentRequest = selectedRequestKind?.key === "investment";
  const isSelectedInterestRequest = selectedRequestKind?.key === "interest";
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

  const selectedNextActionSummary = useMemo(() => {
    if (!selectedMessage || !selectedRequestKind) {
      return {
        label: "لا توجد بيانات متاحة",
        helper: "تعذر تحديد الإجراء التالي لهذا الطلب.",
        needsAction: false,
      };
    }

    if (isLockedFinal) {
      return {
        label: "لا يوجد إجراء مطلوب",
        helper: "الطلب مقفل بعد اكتمال الدورة الحالية.",
        needsAction: false,
      };
    }

    if (selectedRequestStatus === "rejected") {
      return {
        label: "تم رفض الطلب",
        helper: "يمكن مراجعة السجل أو إعادة فتحه من المسؤول التقني عند الحاجة.",
        needsAction: false,
      };
    }

    if (isSelectedInterestRequest) {
      if (!selectedMessage?.adminSeenAt) {
        return {
          label: "يلزم الاطلاع الأول",
          helper:
            "هذا طلب اهتمام تمهيدي، ويكفي الاطلاع عليه وتوثيق ملاحظات أو بدء تواصل مناسب مع العميل.",
          needsAction: true,
        };
      }

      return {
        label: "متابعة اهتمام خفيفة",
        helper:
          "تم تسجيل الاطلاع على الطلب. يمكن الآن فتح ملف العميل أو المشروع ومتابعة التواصل عند الحاجة.",
        needsAction: false,
      };
    }

    if (canFinalize) {
      return {
        label: "جاهز للإقفال النهائي",
        helper:
          "جميع متطلبات الاستثمار المكتملة ظاهرة في السجل، ويمكن تنفيذ الإقفال النهائي من الإجراءات المتاحة.",
        needsAction: true,
      };
    }

    if (canVerifySignedContract) {
      return {
        label: "اعتماد العقد الموقّع",
        helper:
          "العقد الموقّع مرفوع وجاهز للاعتماد قبل الانتقال إلى الإقفال النهائي.",
        needsAction: true,
      };
    }

    if (canCreateInvestmentFromRequest) {
      return {
        label: "إنشاء سجل الاستثمار",
        helper:
          "اكتملت الموافقة الأولية، ويمكن الآن تحويل الطلب إلى سجل استثمار فعلي داخل النظام.",
        needsAction: true,
      };
    }

    if (canInitialApproveRequest) {
      return {
        label: "موافقة أولية مطلوبة",
        helper:
          "الطلب في مرحلة المراجعة ويمكن ترحيله إلى الموافقة الأولية تمهيدًا لإنشاء الاستثمار.",
        needsAction: true,
      };
    }

    if (canStartRequestReview) {
      return {
        label: "بدء المراجعة",
        helper:
          "هذا طلب استثمار جديد وبانتظار بدء المعالجة الداخلية من الفريق المختص.",
        needsAction: true,
      };
    }

    if (selectedMessage?.investmentId) {
      return {
        label: "متابعة دورة الاستثمار",
        helper:
          "تم إنشاء سجل الاستثمار لهذا الطلب، ويمكن متابعة المستندات والحالة من القسم المخصص.",
        needsAction: false,
      };
    }

    return {
      label: "متابعة داخلية",
      helper:
        "لا توجد خطوة تلقائية مباشرة الآن، لكن ما زال الطلب ضمن الدورة النشطة ويتطلب مراجعة الفريق.",
      needsAction: false,
    };
  }, [
    canCreateInvestmentFromRequest,
    canFinalize,
    canInitialApproveRequest,
    canStartRequestReview,
    canVerifySignedContract,
    isLockedFinal,
    isSelectedInterestRequest,
    selectedMessage,
    selectedRequestKind,
    selectedRequestStatus,
  ]);

  const isArchiveMode = useMemo(() => {
    if (!selectedMessage) return false;

    if (["completed", "closed", "rejected"].includes(selectedRequestStatus)) {
      return true;
    }

    return isSelectedInterestRequest && Boolean(selectedMessage?.adminSeenAt);
  }, [
    isSelectedInterestRequest,
    selectedMessage,
    selectedMessage?.adminSeenAt,
    selectedRequestStatus,
  ]);
  const isActiveMode = !!selectedMessage && !isArchiveMode;

  const archiveResultMeta = useMemo(() => {
    if (!selectedMessage) {
      return {
        title: "سجل منتهي",
        helper: "هذا السجل خرج من دائرة المتابعة الحالية.",
      };
    }

    if (selectedRequestStatus === "rejected") {
      return {
        title: "تم رفض الطلب",
        helper: "انتقل هذا السجل إلى الأرشيف، ويمكن الرجوع إلى السجل الزمني أو المستندات عند الحاجة.",
      };
    }

    if (selectedRequestStatus === "closed") {
      return {
        title: "الطلب مغلق",
        helper: "اكتملت الدورة الحالية لهذا السجل وأصبح مرجعًا تاريخيًا فقط.",
      };
    }

    if (isSelectedInterestRequest && selectedMessage?.adminSeenAt) {
      return {
        title: "تمت مراجعة الاهتمام",
        helper:
          selectedInterestReviewMeta?.helperText ||
          "لم يعد هذا الاهتمام ضمن المتابعة الفورية، ويمكن الرجوع إليه من السجل عند الحاجة.",
      };
    }

    return {
      title: "اكتملت دورة الطلب",
      helper: "هذا السجل لم يعد ضمن الواجهة التشغيلية الأساسية، ويظهر هنا كمرجع تاريخي.",
    };
  }, [
    isSelectedInterestRequest,
    selectedInterestReviewMeta?.helperText,
    selectedMessage,
    selectedMessage?.adminSeenAt,
    selectedRequestStatus,
  ]);

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

  const detailPrimaryAction = useMemo<{
    key: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon: ReactNode;
    className: string;
  } | null>(() => {
    if (!isActiveMode) return null;

    if (canFinalize) {
      return {
        key: "finalize",
        label: "إكمال الطلب",
        onClick: activateInvestmentAfterApproval,
        disabled: isLockedFinal || finalizeBusy,
        icon: finalizeBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Building2 className="h-4 w-4" />
        ),
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-emerald-700 hover:bg-emerald-800`,
      };
    }

    if (canVerifySignedContract) {
      return {
        key: "verify_contract",
        label: "اعتماد العقد",
        onClick: verifySignedContract,
        disabled: isLockedFinal || finalizeBusy,
        icon: finalizeBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        ),
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-amber-700 hover:bg-amber-800`,
      };
    }

    if (canCreateInvestmentFromRequest) {
      return {
        key: "create_investment",
        label: "إنشاء الاستثمار",
        onClick: approveRequestAndCreateInvestment,
        disabled: approveCreateBusy || isLockedFinal,
        icon: approveCreateBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        ),
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-blue-700 hover:bg-blue-800`,
      };
    }

    if (canInitialApproveRequest) {
      return {
        key: "initial_approve",
        label: "موافقة أولية",
        onClick: initialApproveRequest,
        disabled: isLockedFinal,
        icon: <ShieldCheck className="h-4 w-4" />,
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-indigo-700 hover:bg-indigo-800`,
      };
    }

    if (canStartRequestReview) {
      return {
        key: "start_review",
        label: "بدء المراجعة",
        onClick: startRequestReview,
        disabled: isLockedFinal,
        icon: <Clock3 className="h-4 w-4" />,
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-yellow-700 hover:bg-yellow-800`,
      };
    }

    return null;
  }, [
    approveCreateBusy,
    canCreateInvestmentFromRequest,
    canFinalize,
    canInitialApproveRequest,
    canStartRequestReview,
    canVerifySignedContract,
    finalizeBusy,
    isActiveMode,
    isLockedFinal,
  ]);

  const detailSecondaryAction = useMemo<{
    key: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon: ReactNode;
    className: string;
  } | null>(() => {
    if (
      !isActiveMode ||
      !isSelectedInvestmentRequest ||
      !canManageMessages ||
      isArchiveMode
    ) {
      return null;
    }

    return {
      key: "reject",
      label: "رفض الطلب",
      onClick: rejectInvestmentRequest,
      disabled: isLockedFinal || !canManageMessages,
      icon: <AlertTriangle className="h-4 w-4" />,
      className: DETAIL_DANGER_BUTTON_CLASS,
    };
  }, [
    canManageMessages,
    isActiveMode,
    isArchiveMode,
    isLockedFinal,
    isSelectedInvestmentRequest,
  ]);

  const showDocumentsTab =
    isSelectedInvestmentRequest ||
    !!selectedMessage?.investmentId ||
    hasOriginalContract ||
    hasSignedContract;
  const canEditInternalNotes =
    canManageMessages && myRole !== "client" && isActiveMode;
  const hasStoredInternalNotes = Boolean(String(internalNotes || "").trim());
  const showInternalNotesTab =
    canManageMessages &&
    myRole !== "client" &&
    (canEditInternalNotes || hasStoredInternalNotes);
  const showArchiveContractUpload =
    isArchiveMode &&
    canAdmin &&
    canManageInvestments &&
    !!selectedMessage?.investmentId &&
    !hasOperationalInvestmentStarted;
  const showStopInvestmentAdvancedAction =
    isArchiveMode &&
    !!selectedMessage?.investmentId &&
    hasOperationalInvestmentStarted;
  const showReopenAdvancedAction =
    isArchiveMode &&
    isSelectedInvestmentRequest &&
    myRole === "owner" &&
    canManageMessages;
  const showAdvancedActions =
    showArchiveContractUpload ||
    showReopenAdvancedAction ||
    showStopInvestmentAdvancedAction;
  const availableDetailTabs = useMemo<DetailSecondaryTabKey[]>(
    () => [
      "context",
      "timeline",
      ...(showDocumentsTab ? (["documents"] as DetailSecondaryTabKey[]) : []),
      ...(showInternalNotesTab
        ? (["internal_notes"] as DetailSecondaryTabKey[])
        : []),
    ],
    [showDocumentsTab, showInternalNotesTab]
  );
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
  const workflowSteps = useMemo(
    () =>
      !selectedMessage || !isSelectedInvestmentRequest
        ? []
        : [
          {
            key: "review_start" as WorkflowStepKey,
            label: "بدء المراجعة",
            helper: "استلام الطلب وبدء معالجته داخليًا.",
            targetTab: "context" as DetailSecondaryTabKey,
            icon: <Clock3 className="h-4 w-4" />,
          },
          {
            key: "investment_creation" as WorkflowStepKey,
            label: "إنشاء الاستثمار",
            helper: "اعتماد الطلب وتجهيز سجل الاستثمار داخل النظام.",
            targetTab: "context" as DetailSecondaryTabKey,
            icon: <CheckCircle2 className="h-4 w-4" />,
          },
          {
            key: "contract_upload" as WorkflowStepKey,
            label: "رفع العقد",
            helper: "متابعة المستندات ورفع العقد الأصلي من التبويب المخصص.",
            targetTab: showDocumentsTab
              ? ("documents" as DetailSecondaryTabKey)
              : ("context" as DetailSecondaryTabKey),
            icon: <Upload className="h-4 w-4" />,
          },
          {
            key: "request_completion" as WorkflowStepKey,
            label: "إكمال الطلب",
            helper: "اعتماد العقد ثم إقفال الدورة الحالية لهذا الطلب.",
            targetTab: isArchiveMode
              ? ("timeline" as DetailSecondaryTabKey)
              : showDocumentsTab
                ? ("documents" as DetailSecondaryTabKey)
                : ("timeline" as DetailSecondaryTabKey),
            icon: <Building2 className="h-4 w-4" />,
          },
        ],
    [isArchiveMode, isSelectedInvestmentRequest, selectedMessage, showDocumentsTab]
  );
  const workflowCurrentStepKey = useMemo<WorkflowStepKey | null>(() => {
    if (!selectedMessage || !isSelectedInvestmentRequest) return null;

    const hasInvestmentRecord = Boolean(selectedMessage?.investmentId);
    const normalizedStageRole = String(selectedMessage?.stageRole || "")
      .trim()
      .toLowerCase();
    const isCompletionStageData =
      ["completed", "closed"].includes(selectedRequestStatus) ||
      selectedInvestmentStatus === "active" ||
      selectedInvestmentStatus === "signed" ||
      contractStatusValue === "approved" ||
      (hasCurrentSignedContract &&
        ["under_review", "signed", "approved"].includes(contractStatusValue));

    if (selectedRequestStatus === "pending") {
      return "review_start";
    }

    if (selectedRequestStatus === "rejected") {
      if (isCompletionStageData) {
        return "request_completion";
      }

      if (hasInvestmentRecord || hasOriginalContract || hasSignedContract) {
        return "contract_upload";
      }

      return ["reviewer", "review", "staff", "accountant", "investment"].includes(
        normalizedStageRole
      )
        ? "investment_creation"
        : "review_start";
    }

    if (!hasInvestmentRecord) {
      return "investment_creation";
    }

    if (isCompletionStageData) {
      return "request_completion";
    }

    return "contract_upload";
  }, [
    contractStatusValue,
    hasCurrentSignedContract,
    hasOriginalContract,
    hasSignedContract,
    isSelectedInvestmentRequest,
    selectedInvestmentStatus,
    selectedMessage,
    selectedRequestStatus,
  ]);
  const workflowCurrentStepIndex = workflowCurrentStepKey
    ? workflowSteps.findIndex(step => step.key === workflowCurrentStepKey)
    : -1;
  const workflowCurrentStepMeta =
    workflowCurrentStepIndex >= 0 ? workflowSteps[workflowCurrentStepIndex] : null;
  const workflowNextStepMeta =
    workflowCurrentStepIndex >= 0 &&
      workflowCurrentStepIndex < workflowSteps.length - 1
      ? workflowSteps[workflowCurrentStepIndex + 1]
      : null;
  const workflowPreferredTab = useMemo<DetailSecondaryTabKey>(() => {
    if (!workflowCurrentStepKey) {
      return isArchiveMode ? "timeline" : "context";
    }

    switch (workflowCurrentStepKey) {
      case "review_start":
      case "investment_creation":
        return "context";
      case "contract_upload":
        return showDocumentsTab ? "documents" : "context";
      case "request_completion":
      default:
        return isArchiveMode
          ? "timeline"
          : showDocumentsTab
            ? "documents"
            : "timeline";
    }
  }, [isArchiveMode, showDocumentsTab, workflowCurrentStepKey]);
  const detailFlowSummary = useMemo(() => {
    if (!isSelectedInvestmentRequest || !workflowCurrentStepKey) {
      return selectedNextActionSummary;
    }

    switch (workflowCurrentStepKey) {
      case "review_start":
        return {
          label: "بدء المراجعة",
          helper: canStartRequestReview
            ? "هذا الطلب جديد وبانتظار بدء المراجعة الداخلية من الفريق."
            : "تم فتح الطلب ويمكن متابعة تفاصيله من السياق والسجل.",
          needsAction: canStartRequestReview,
        };
      case "investment_creation":
        return {
          label: canCreateInvestmentFromRequest
            ? "إنشاء الاستثمار"
            : canInitialApproveRequest
              ? "استكمال المراجعة"
              : "إنشاء الاستثمار",
          helper: canCreateInvestmentFromRequest
            ? "اكتملت المراجعة الأولية ويمكن الآن إنشاء سجل الاستثمار."
            : canInitialApproveRequest
              ? "الطلب في مرحلة المراجعة ويحتاج اعتمادًا تمهيديًا قبل إنشاء الاستثمار."
              : "الطلب ضمن مرحلة التجهيز لإنشاء الاستثمار ويمكن متابعة السجل والسياق من الصفحة.",
          needsAction:
            canCreateInvestmentFromRequest || canInitialApproveRequest,
        };
      case "contract_upload":
        return {
          label:
            canAdmin && canManageInvestments
              ? "رفع العقد"
              : "متابعة المستندات",
          helper:
            canAdmin && canManageInvestments
              ? "تم إنشاء الاستثمار، والمرحلة الحالية هي رفع العقد من تبويب المستندات."
              : "تم إنشاء الاستثمار، ويمكن متابعة حالة العقد من تبويب المستندات.",
          needsAction: canAdmin && canManageInvestments,
        };
      case "request_completion":
        return {
          label: canFinalize
            ? "إكمال الطلب"
            : canVerifySignedContract
              ? "اعتماد العقد"
              : isArchiveMode
                ? "اكتملت الدورة الحالية"
                : "إكمال الطلب",
          helper: isArchiveMode
            ? archiveResultMeta.helper
            : canFinalize
              ? "العقد جاهز والمرحلة الأخيرة هي الإقفال النهائي للطلب."
              : canVerifySignedContract
                ? "العقد الموقّع جاهز للاعتماد قبل الإقفال النهائي."
                : "الطلب وصل إلى المرحلة الأخيرة ويمكن مراجعة المستندات أو انتظار إجراء الإكمال حسب الصلاحيات الحالية.",
          needsAction: canFinalize || canVerifySignedContract,
        };
      default:
        return selectedNextActionSummary;
    }
  }, [
    archiveResultMeta.helper,
    canAdmin,
    canCreateInvestmentFromRequest,
    canFinalize,
    canInitialApproveRequest,
    canManageInvestments,
    canStartRequestReview,
    canVerifySignedContract,
    isArchiveMode,
    isSelectedInvestmentRequest,
    selectedNextActionSummary,
    workflowCurrentStepKey,
  ]);
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
  const detailHeaderMetrics = [
    {
      key: "request_number",
      label: "رقم الطلب",
      value: requestNumber(selectedMessage),
      icon: <FileText className="h-3.5 w-3.5" />,
      mono: true,
      strong: true,
    },
    {
      key: "request_kind",
      label: "نوع الطلب",
      value: selectedRequestKind?.label || "—",
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      strong: true,
    },
    {
      key: "status",
      label: "الحالة",
      value: selectedStatusMeta?.label || "—",
      icon: <Eye className="h-3.5 w-3.5" />,
      strong: true,
    },
    {
      key: "stage",
      label: "المرحلة",
      value: selectedStageMeta?.label || "—",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
    },
    {
      key: "project",
      label: "المشروع",
      value: selectedProjectTitle,
      icon: <Building2 className="h-3.5 w-3.5" />,
      strong: true,
    },
    {
      key: "updated_at",
      label: "آخر تحديث",
      value: formatDateTimeAR(selectedUpdatedAtValue),
      helper: formatRequestTimeLabel(selectedUpdatedAtValue),
      icon: <RefreshCw className="h-3.5 w-3.5" />,
    },
  ];
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

  const renderDetailContextRow = () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className={cn("rsg-card", DETAIL_SECTION_CARD_CLASS)}>
        <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>العميل</CardTitle>
              <p className="text-sm leading-7 text-slate-500">
                جهة التواصل الأساسية المرتبطة بهذا الطلب.
              </p>
            </div>
            <Badge
              className={cn(
                DETAIL_PILL_BASE_CLASS,
                selectedClient?.sourceTone
              )}
            >
              {selectedClient?.sourceLabel || "بيانات الطلب"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className={`${DETAIL_SECTION_CONTENT_CLASS} space-y-4`}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold text-slate-950">
                {selectedClient?.clientName || "مستخدم غير معروف"}
              </div>
              <Badge
                className={cn(
                  DETAIL_COMPACT_PILL_BASE_CLASS,
                  "border-slate-200 bg-slate-100 text-slate-700"
                )}
              >
                {selectedClient?.clientRoleLabel || "عميل"}
              </Badge>
            </div>
            <div className="text-sm leading-7 text-slate-600">
              <span className="text-slate-500">{primaryContactLabel}: </span>
              {primaryContactValue}
            </div>
            {selectedClient?.sourceHelper ? (
              <p className="text-sm leading-7 text-slate-500">
                {selectedClient.sourceHelper}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className={DETAIL_OUTLINE_BUTTON_CLASS}
              onClick={openSelectedClientProfile}
            >
              <FileText className="h-4 w-4" />
              فتح ملف العميل
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className={cn("rsg-card", DETAIL_SECTION_CARD_CLASS)}>
        <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>المشروع</CardTitle>
              <p className="text-sm leading-7 text-slate-500">
                مرجع المشروع المرتبط بهذا السجل الآن.
              </p>
            </div>
            {isSelectedInterestRequest ? (
              <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                اهتمام
              </Badge>
            ) : (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                استثمار
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className={`${DETAIL_SECTION_CONTENT_CLASS} space-y-4`}>
          <div className="space-y-2">
            <div className="text-lg font-semibold text-slate-950">
              {selectedProjectTitle}
            </div>
            <p className="text-sm leading-7 text-slate-600">
              {isSelectedInvestmentRequest
                ? `المبلغ الحالي المرتبط بالطلب: ${moneySAR(selectedAmount)}`
                : "هذا السجل مرتبط بمتابعة اهتمام أولية للمشروع المحدد."}
            </p>
            {selectedRemaining != null && isSelectedInvestmentRequest ? (
              <p className="text-sm leading-7 text-slate-500">
                المتبقي بالمشروع:{" "}
                {selectedAmountExceeded
                  ? `${moneySAR(selectedRemaining)} (تجاوز)`
                  : moneySAR(selectedRemaining)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className={DETAIL_OUTLINE_BUTTON_CLASS}
              onClick={openSelectedProject}
            >
              <ExternalLink className="h-4 w-4" />
              فتح المشروع
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderDetailWorkflowStepper = () =>
    workflowSteps.length ? (
      <DetailSection
        title="مسار المعالجة"
        description={
          isArchiveMode
            ? "عرض بصري مختصر يوضح أين انتهت دورة الطلب وما الذي اكتمل منها."
            : "مسار واضح يحدد المرحلة الحالية ويوجهك مباشرة إلى الخطوة التالية."
        }
        badge={
          selectedRequestStatus === "rejected" ? (
            <Badge className="border-rose-200 bg-rose-50 text-rose-700">
              متوقف
            </Badge>
          ) : isArchiveMode ? (
            <Badge className="border-slate-200 bg-slate-100 text-slate-700">
              مؤرشف
            </Badge>
          ) : (
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Guided Workflow
            </Badge>
          )
        }
      >
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          {workflowSteps.map((step, index) => {
            const state =
              workflowCurrentStepIndex === -1
                ? "pending"
                : selectedRequestStatus === "rejected"
                  ? index < workflowCurrentStepIndex
                    ? "completed"
                    : index === workflowCurrentStepIndex
                      ? "halted"
                      : "pending"
                  : index < workflowCurrentStepIndex
                    ? "completed"
                    : index === workflowCurrentStepIndex
                      ? "active"
                      : "pending";
            const isTabFocused =
              detailSecondaryTab === resolveDetailTab(step.targetTab);

            return (
              <button
                key={step.key}
                type="button"
                onClick={() => openDetailTab(step.targetTab)}
                className={cn(
                  "rounded-[24px] border px-4 py-4 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
                  state === "completed" &&
                  "border-emerald-200 bg-emerald-50/80 text-emerald-950",
                  state === "active" &&
                  "border-slate-900 bg-slate-950 text-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.42)]",
                  state === "pending" &&
                  "border-slate-200/80 bg-white text-slate-700 hover:border-slate-300",
                  state === "halted" &&
                  "border-rose-200 bg-rose-50/90 text-rose-900",
                  isTabFocused && "ring-1 ring-offset-0 ring-slate-300"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-semibold",
                      state === "completed" &&
                      "border-emerald-300 bg-emerald-100 text-emerald-700",
                      state === "active" &&
                      "border-white/15 bg-white/10 text-white",
                      state === "pending" &&
                      "border-slate-200 bg-slate-100 text-slate-600",
                      state === "halted" &&
                      "border-rose-300 bg-rose-100 text-rose-700"
                    )}
                  >
                    {state === "completed" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      step.icon
                    )}
                  </div>

                  <Badge
                    className={cn(
                      DETAIL_COMPACT_PILL_BASE_CLASS,
                      state === "completed" &&
                      "border-emerald-200 bg-white/80 text-emerald-700",
                      state === "active" &&
                      "border-white/15 bg-white/10 text-white",
                      state === "pending" &&
                      "border-slate-200 bg-slate-100 text-slate-600",
                      state === "halted" &&
                      "border-rose-200 bg-white/70 text-rose-700"
                    )}
                  >
                    {state === "completed"
                      ? "مكتملة"
                      : state === "active"
                        ? "الحالية"
                        : state === "halted"
                          ? "توقفت هنا"
                          : "قادمة"}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="text-base font-semibold">{step.label}</div>
                  <p
                    className={cn(
                      "text-sm leading-7",
                      state === "active" ? "text-white/80" : "text-current/80"
                    )}
                  >
                    {step.helper}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {workflowCurrentStepMeta ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
              <div className={DETAIL_INLINE_LABEL_CLASS}>أنت الآن هنا</div>
              <div className="text-base font-semibold text-slate-950">
                {workflowCurrentStepMeta.label}
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {workflowCurrentStepMeta.helper}
              </p>
            </div>
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
              <div className={DETAIL_INLINE_LABEL_CLASS}>الانتقال المقترح</div>
              <div className="text-base font-semibold text-slate-950">
                {workflowNextStepMeta?.label ||
                  (isArchiveMode ? "اكتملت الدورة الحالية" : "المراجعة النهائية")}
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {workflowNextStepMeta?.helper ||
                  (isArchiveMode
                    ? "يمكن الرجوع الآن إلى السجل أو المستندات فقط عند الحاجة."
                    : detailFlowSummary.helper)}
              </p>
            </div>
          </div>
        ) : null}
      </DetailSection>
    ) : null;

  const renderDetailPrimaryPanel = () =>
    isActiveMode ? (
      <DetailSection
        title="التشغيل الحالي"
        description="الحالة الحالية والخطوة التالية فقط، مع CTA سياقي واحد يوجه المسار."
        badge={
          selectedTrackingMeta ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(DETAIL_PILL_BASE_CLASS, selectedTrackingMeta.tone)}
              >
                {selectedTrackingMeta.label}
              </Badge>
              {selectedTrackingSlaMeta ? (
                <Badge
                  className={cn(
                    DETAIL_COMPACT_PILL_BASE_CLASS,
                    selectedTrackingSlaMeta.className
                  )}
                >
                  {selectedTrackingSlaMeta.label}
                </Badge>
              ) : null}
            </div>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
          <div
            className={cn(
              "rounded-[24px] border px-5 py-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.22)]",
              isSelectedInterestRequest
                ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-amber-950"
                : "border-slate-900/10 bg-[linear-gradient(135deg,rgba(11,23,38,0.98)_0%,rgba(16,32,58,0.96)_70%,rgba(255,255,255,0.06)_135%)] text-white"
            )}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              {selectedTrackingMeta ? (
                <Badge
                  className={cn(
                    DETAIL_PILL_BASE_CLASS,
                    selectedTrackingMeta?.tone
                  )}
                >
                  {selectedTrackingMeta?.label}
                </Badge>
              ) : null}
              {selectedTrackingSlaMeta ? (
                <Badge
                  className={cn(
                    DETAIL_COMPACT_PILL_BASE_CLASS,
                    selectedTrackingSlaMeta.className
                  )}
                >
                  {selectedTrackingSlaMeta.label}
                </Badge>
              ) : null}
              {!isSelectedInterestRequest && selectedStatusMeta ? (
                <Badge
                  className={cn(
                    DETAIL_PILL_BASE_CLASS,
                    selectedStatusMeta?.tone
                  )}
                >
                  {selectedStatusMeta?.label}
                </Badge>
              ) : null}
              {isSelectedInterestRequest ? null : (
                <Badge className={DETAIL_STAGE_PILL_CLASS}>
                  {selectedStageMeta?.label || "—"}
                </Badge>
              )}
            </div>

            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-[20px] border border-white/12 bg-white/5 px-4 py-4">
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-current/70">
                    المرحلة الحالية
                  </div>
                  <div className="mt-2 text-lg font-semibold leading-8 text-current">
                    {workflowCurrentStepMeta?.label ||
                      selectedStageMeta?.label ||
                      selectedStatusMeta?.label ||
                      "—"}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-current/80">
                    {workflowCurrentStepMeta?.helper ||
                      "هذه هي المرحلة التي يعتمد عليها التوجيه الحالي داخل الصفحة."}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/12 bg-white/5 px-4 py-4">
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-current/70">
                    الخطوة التالية
                  </div>
                  <div className="mt-2 text-lg font-semibold leading-8 text-current">
                    {workflowNextStepMeta?.label || detailFlowSummary.label}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-current/80">
                    {workflowNextStepMeta?.helper || detailFlowSummary.helper}
                  </p>
                </div>
              </div>

              {detailVisiblePrimaryAction || detailSecondaryAction ? (
                <div className="flex flex-wrap gap-3 pt-2">
                  {detailVisiblePrimaryAction ? (
                    <Button
                      className={detailVisiblePrimaryAction.className}
                      onClick={detailVisiblePrimaryAction.onClick}
                      disabled={detailVisiblePrimaryAction.disabled}
                    >
                      {detailVisiblePrimaryAction.icon}
                      {detailVisiblePrimaryAction.label}
                    </Button>
                  ) : null}
                  {detailSecondaryAction ? (
                    <Button
                      className={detailSecondaryAction.className}
                      onClick={detailSecondaryAction.onClick}
                      disabled={detailSecondaryAction.disabled}
                    >
                      {detailSecondaryAction.icon}
                      {detailSecondaryAction.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <DetailSummaryMetric
              label={
                isSelectedInterestRequest ? "وضع المتابعة" : "المبلغ الحالي"
              }
              value={
                isSelectedInterestRequest
                  ? selectedInterestReviewMeta?.label || "جديد"
                  : moneySAR(selectedAmount)
              }
              helper={
                isSelectedInterestRequest
                  ? selectedInterestReviewMeta?.helperText
                  : selectedMessage?.investmentId
                    ? `سجل الاستثمار ${selectedMessage.investmentId}`
                    : "لم يتم إنشاء سجل الاستثمار بعد"
              }
              icon={<Wallet className="h-3.5 w-3.5" />}
              strong
            />
            <DetailSummaryMetric
              label="آخر من عدّل"
              value={selectedLastActor?.name || "—"}
              helper={selectedLastActor?.roleLabel || undefined}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </DetailSection>
    ) : (
      <DetailSection
        title="النتيجة النهائية"
        description="عرض أرشيفي مختصر يركّز على النتيجة النهائية وما يلزم الرجوع إليه فقط."
        badge={
          <Badge className="border-slate-200 bg-slate-100 text-slate-700">
            أرشيف
          </Badge>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
          <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] px-5 py-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]">
            <div className="flex flex-wrap items-center gap-2.5">
              {selectedStatusMeta ? (
                <Badge
                  className={cn(
                    DETAIL_PILL_BASE_CLASS,
                    selectedStatusMeta?.tone
                  )}
                >
                  {selectedStatusMeta?.label}
                </Badge>
              ) : null}
              {isSelectedInterestRequest ? (
                <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                  انتهاء متابعة الاهتمام
                </Badge>
              ) : null}
            </div>

            <div className="mt-5">
              <div className="text-2xl font-semibold leading-9 text-slate-950">
                {archiveResultMeta.title}
              </div>
              <p className="mt-2 text-sm leading-8 text-slate-600">
                {archiveResultMeta.helper}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <DetailSummaryMetric
              label="الحالة النهائية"
              value={selectedStatusMeta?.label || "—"}
              icon={<Eye className="h-3.5 w-3.5" />}
              strong
            />
            <DetailSummaryMetric
              label="آخر تحديث"
              value={formatDateTimeAR(selectedUpdatedAtValue)}
              helper={formatRequestTimeLabel(selectedUpdatedAtValue)}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </DetailSection>
    );

  const renderDetailContextTab = () => (
    <DetailSection
      title="السياق المرتبط بالطلب"
      description="المحتوى الوصفي والتفسيري المرتبط بهذا السجل دون منحه وزنًا تشغيليًا أعلى من اللازم."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] p-5 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.18)]">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
            رسالة العميل / الوصف
          </div>
          <p className="mt-3 text-sm leading-8 text-slate-700">
            {selectedRequestSummary || "لا توجد رسالة مفصلة مرفقة مع هذا الطلب."}
          </p>
        </div>

        <div
          className={cn(
            "rounded-[24px] border px-5 py-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]",
            isSelectedInterestRequest
              ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)]"
              : "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(255,255,255,0.98)_100%)]"
          )}
        >
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
            {isSelectedInterestRequest ? "قراءة الاهتمام" : "قراءة الاستثمار"}
          </div>
          <div className="mt-3 space-y-3">
            <DetailSummaryMetric
              label="المشروع"
              value={selectedProjectTitle}
              icon={<Building2 className="h-3.5 w-3.5" />}
              strong
              className="border-transparent bg-white/85 shadow-none"
            />
            {isSelectedInterestRequest ? (
              <DetailSummaryMetric
                label="وضع المتابعة"
                value={selectedInterestReviewMeta?.label || "جديد"}
                helper={selectedInterestReviewMeta?.helperText}
                icon={<Eye className="h-3.5 w-3.5" />}
                className="border-transparent bg-white/85 shadow-none"
              />
            ) : (
              <>
                <DetailSummaryMetric
                  label="المبلغ"
                  value={moneySAR(selectedAmount)}
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  strong
                  className="border-transparent bg-white/85 shadow-none"
                />
                <DetailSummaryMetric
                  label="سجل الاستثمار"
                  value={
                    selectedMessage?.investmentId
                      ? "تم إنشاء سجل الاستثمار"
                      : "بانتظار إنشاء السجل"
                  }
                  helper={
                    selectedMessage?.investmentId
                      ? `رقم السجل ${selectedMessage.investmentId}`
                      : undefined
                  }
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  className="border-transparent bg-white/85 shadow-none"
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "rounded-[24px] border px-5 py-4 text-sm leading-8 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.2)]",
          isSelectedInterestRequest
            ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-amber-950"
            : "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-emerald-950"
        )}
      >
        {isSelectedInterestRequest
          ? selectedInterestReviewMeta?.helperText || selectedRequestKind?.helperText
          : selectedMessage?.investmentId
            ? "تم ربط هذا الطلب بسجل استثمار فعلي، لذلك يظهر هنا كسجل تشغيلي مرتبط بالمستندات والحالة الحالية."
            : "هذا الطلب ما زال في المرحلة السابقة لإنشاء الاستثمار، لذلك يبقى التركيز على المشروع والمبلغ والقرار المطلوب من الفريق."}
      </div>
    </DetailSection>
  );

  const renderDetailTimelineTab = () => (
    <DetailSection
      title="السجل الزمني"
      description="التحديثات والأنشطة السابقة المرتبطة بهذا السجل."
    >
      {selectedTimelineEvents.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {selectedTimelineEvents.map(item => (
            <DetailTimelineItem
              key={item.id}
              title={item.title}
              note={item.note}
              actorName={item.actor.name}
              actorRole={item.actor.roleLabel}
              timeLabel={item.timeLabel}
              dateLabel={item.atLabel}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm leading-7 text-slate-500">
          لا توجد أنشطة إضافية مسجلة على هذا الطلب حتى الآن.
        </div>
      )}
    </DetailSection>
  );

  const renderDocumentsSectionBody = ({ showUpload }: { showUpload: boolean }) => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DetailDocumentsMetricCard
          label="رقم الاستثمار"
          icon={<Building2 className="h-4 w-4" />}
        >
          <div className="break-words text-base font-semibold text-slate-950">
            {String(selectedMessage?.investmentId || "-")}
          </div>
        </DetailDocumentsMetricCard>

        <DetailDocumentsMetricCard
          label="حالة العقد"
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <DetailContractStatusBadges
            status={contractStatusValue}
            followupLabel={contractFollowupChipLabel || undefined}
          />
        </DetailDocumentsMetricCard>

        <DetailDocumentsMetricCard
          label="العقد الأصلي"
          icon={<FileText className="h-4 w-4" />}
        >
          <DetailBinaryBadge
            active={hasOriginalContract}
            activeLabel="مرفوع"
            inactiveLabel="لا يوجد"
          />
        </DetailDocumentsMetricCard>

        <DetailDocumentsMetricCard
          label="العقد الموقّع"
          icon={<CheckCircle2 className="h-4 w-4" />}
        >
          <DetailBinaryBadge
            active={hasCurrentSignedContract}
            activeLabel="مرفوع"
            inactiveLabel="لا يوجد"
          />
        </DetailDocumentsMetricCard>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DetailDocumentFileCard
          title="العقد الأصلي"
          available={hasOriginalContract}
          fileName={originalContractFileName}
          viewUrl={originalContractViewUrl}
          downloadUrl={originalContractDownloadUrl}
          emptyTitle="لا يوجد عقد أصلي مرفوع"
          emptyDescription="سيظهر العقد الأصلي هنا بعد رفعه وربطه بهذا الاستثمار."
          alertText={
            needsFreshSignedContract
              ? "تم تحديث العقد الأصلي، وسيحتاج المستثمر إلى توقيع النسخة الجديدة."
              : undefined
          }
        />

        <DetailDocumentFileCard
          title="العقد الموقّع"
          available={hasCurrentSignedContract}
          fileName={signedContractFileName}
          viewUrl={signedContractViewUrl}
          downloadUrl={signedContractDownloadUrl}
          emptyTitle={
            needsFreshSignedContract
              ? "النسخة الموقّعة الحالية غير متوفرة"
              : "لم يتم رفع العقد الموقّع بعد"
          }
          emptyDescription={
            needsFreshSignedContract
              ? "تم تحديث العقد الأصلي، وينتظر النظام رفع النسخة الموقّعة الجديدة من المستثمر."
              : "سيظهر العقد الموقّع هنا بعد أن يرفعه المستثمر ويُربط بهذا الاستثمار."
          }
        />
      </div>

      {showUpload ? (
        <div className="space-y-4 border-t border-slate-200/80 pt-6">
          <div className="space-y-1">
            <div className={DETAIL_INLINE_LABEL_CLASS}>رفع المستندات</div>
            <p className="text-sm leading-7 text-slate-600">
              ارفع العقد الأصلي بصيغة PDF ليظهر ضمن المستندات المرتبطة ويصبح جاهزًا
              للمتابعة.
            </p>
          </div>

          <DetailContractUploadPanel
            file={draftFile}
            onFileChange={setDraftFile}
            disabled={contractBusy || !selectedMessage?.investmentId}
            busy={contractBusy}
            buttonLabel="رفع العقد الأصلي"
            onSubmit={createContractForInvestment}
            submitDisabled={
              contractBusy || !selectedMessage?.investmentId || !draftFile || !canAdmin
            }
          />
        </div>
      ) : null}
    </div>
  );

  const renderDetailDocumentsTab = () => (
    <DetailSection
      title="المستندات المرتبطة"
      description={
        isArchiveMode
          ? "تُعرض المستندات هنا للرجوع والقراءة فقط ضمن وضع الأرشيف."
          : "ملفات الاستثمار والعقود المرتبطة بهذا الطلب."
      }
    >
      {renderDocumentsSectionBody({ showUpload: isActiveMode })}
    </DetailSection>
  );

  const renderDetailInternalNotesTab = () => (
    <DetailSection
      title="الملاحظات الداخلية"
      description={
        canEditInternalNotes
          ? "ملاحظات تنظيمية داخلية يمكن تحديثها ضمن الحالة الحالية."
          : "ملاحظات داخلية محفوظة للرجوع فقط."
      }
    >
      {canEditInternalNotes ? (
        <div className="space-y-4">
          <div className={DETAIL_INLINE_PANEL_CLASS}>
            <Label className={DETAIL_INLINE_LABEL_CLASS}>ملاحظات داخلية</Label>
            <Textarea
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              placeholder="ملاحظات للإدارة فقط..."
              className={DETAIL_TEXTAREA_CLASS}
            />
            <p className="mt-3 text-xs leading-6 text-slate-500">
              هذا الحقل مخصص للملاحظات الداخلية والتنظيمية فقط.
            </p>
          </div>
          <Button
            className={cn(DETAIL_LIGHT_SOLID_BUTTON_CLASS, "w-full sm:w-auto")}
            onClick={handleSaveNotesOnly}
          >
            <CheckCircle2 className="h-4 w-4" />
            حفظ الملاحظات
          </Button>
        </div>
      ) : (
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-sm leading-8 text-slate-700">
          {hasStoredInternalNotes
            ? internalNotes
            : "لا توجد ملاحظات داخلية محفوظة لهذا السجل."}
        </div>
      )}
    </DetailSection>
  );

  const renderDetailSecondaryTabs = () => (
    <Tabs
      value={detailSecondaryTab}
      onValueChange={value =>
        setDetailSecondaryTab(resolveDetailTab(value as DetailSecondaryTabKey))
      }
      className="gap-4"
    >
      <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl bg-slate-100/80 p-1.5">
        <TabsTrigger
          value="context"
          className="shrink-0 rounded-xl px-4 py-2"
        >
          السياق
        </TabsTrigger>
        <TabsTrigger
          value="timeline"
          className="shrink-0 rounded-xl px-4 py-2"
        >
          السجل
        </TabsTrigger>
        {showDocumentsTab ? (
          <TabsTrigger
            value="documents"
            className="shrink-0 rounded-xl px-4 py-2"
          >
            المستندات
          </TabsTrigger>
        ) : null}
        {showInternalNotesTab ? (
          <TabsTrigger
            value="internal_notes"
            className="shrink-0 rounded-xl px-4 py-2"
          >
            الملاحظات الداخلية
          </TabsTrigger>
        ) : null}
      </TabsList>

      <TabsContent value="context" className="mt-0 space-y-6">
        {renderDetailContextTab()}
      </TabsContent>
      <TabsContent value="timeline" className="mt-0 space-y-6">
        {renderDetailTimelineTab()}
      </TabsContent>
      {showDocumentsTab ? (
        <TabsContent value="documents" className="mt-0 space-y-6">
          {renderDetailDocumentsTab()}
        </TabsContent>
      ) : null}
      {showInternalNotesTab ? (
        <TabsContent value="internal_notes" className="mt-0 space-y-6">
          {renderDetailInternalNotesTab()}
        </TabsContent>
      ) : null}
    </Tabs>
  );

  const renderDetailAdvancedActions = () =>
    showAdvancedActions ? (
      <Accordion
        type="single"
        collapsible
        className="rounded-[28px] border border-slate-200/80 bg-white/95 px-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.26)]"
      >
        <AccordionItem value="advanced-actions" className="border-none">
          <AccordionTrigger className="py-5 text-right text-base font-semibold text-slate-950 hover:no-underline">
            إجراءات متقدمة
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <div className="space-y-4">
              {showReopenAdvancedAction ? (
                <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                  <div className="mb-3 text-sm font-semibold text-slate-950">
                    إعادة فتح الطلب
                  </div>
                  <p className="mb-4 text-sm leading-7 text-slate-600">
                    إجراء استثنائي عالي الصلاحية لإرجاع السجل إلى دورة المتابعة
                    مرة أخرى.
                  </p>
                  <Button
                    variant="outline"
                    className={DETAIL_OUTLINE_BUTTON_CLASS}
                    onClick={reopenMessage}
                    disabled={
                      reopenBusy || myRole !== "owner" || !canManageMessages
                    }
                  >
                    {reopenBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clock3 className="h-4 w-4" />
                    )}
                    إعادة فتح (للمسؤول التقني)
                  </Button>
                </div>
              ) : null}

              {showArchiveContractUpload ? (
                <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                  <div className="mb-3 text-sm font-semibold text-slate-950">
                    رفع عقد بعد الإغلاق
                  </div>
                  <p className="mb-4 text-sm leading-7 text-slate-600">
                    يظل هذا الإجراء متاحًا هنا فقط لأنه خارج التدفق التشغيلي
                    الأساسي للسجل المؤرشف.
                  </p>
                  <div className="space-y-4">
                    <ContractFilePicker
                      buttonLabel="رفع العقد الأصلي (PDF)"
                      file={draftFile}
                      onFileChange={setDraftFile}
                      panelClassName="rounded-[18px] border border-slate-200 bg-white px-4 py-4 sm:px-4"
                      buttonClassName={DETAIL_OUTLINE_BUTTON_CLASS}
                      fileNameClassName="text-sm font-semibold text-slate-950"
                      helperTextClassName="text-xs leading-6 text-slate-500"
                      disabled={contractBusy || !selectedMessage?.investmentId}
                    />
                    <Button
                      className={`w-full sm:w-auto ${DETAIL_SOLID_BUTTON_CLASS} bg-blue-700 hover:bg-blue-800`}
                      onClick={createContractForInvestment}
                      disabled={
                        contractBusy ||
                        !selectedMessage?.investmentId ||
                        !draftFile ||
                        !canAdmin
                      }
                    >
                      {contractBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      رفع العقد الأصلي
                    </Button>
                  </div>
                </div>
              ) : null}

              {showStopInvestmentAdvancedAction ? (
                <div className="rounded-[22px] border border-rose-200/80 bg-rose-50/40 px-4 py-4">
                  <div className="mb-3 text-sm font-semibold text-slate-950">
                    {isSelectedInvestmentStoppedEarly
                      ? "إيقاف الاستثمار بطلب العميل"
                      : "إيقاف الاستثمار"}
                  </div>
                  <p className="mb-4 text-sm leading-7 text-slate-600">
                    بدأ هذا الاستثمار فعليًا، لذلك لم يعد رفع العقد الأصلي إجراءً صحيحًا في
                    هذا القسم. متابعة الإيقاف المبكر والتسوية تتم من المسار المالي الحالي
                    المرتبط بالاستثمار.
                  </p>
                  <Button
                    className={
                      isSelectedInvestmentStoppedEarly
                        ? DETAIL_OUTLINE_BUTTON_CLASS
                        : DETAIL_DANGER_BUTTON_CLASS
                    }
                    onClick={openStopInvestmentDialog}
                    disabled={!canEditFinancial || !investmentDoc?.id}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {isSelectedInvestmentStoppedEarly
                      ? "مراجعة إيقاف الاستثمار"
                      : "إيقاف الاستثمار بطلب العميل"}
                  </Button>
                </div>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    ) : null;

  /* =========================
     Render
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!isRequestDetailsRouteActive ? (
          <>
            <section className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_70px_-42px_rgba(15,23,42,0.42)]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.66),transparent_55%)]" />

              <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-3">
                  <div className="inline-flex w-fit items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-teal-700">
                    سجل تشغيلي مباشر
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                      طلبات الاستثمار
                    </h1>
                  </div>
                  <p>
                    عرض شامل لجميع طلبات الاستثمار مع تتبع حالتها والإجراءات المرتبطة بها.              </p>
                </div>

                <div className="xl:min-w-[220px]">
                  <div className="rounded-[22px] border border-slate-200 bg-white/85 p-4 shadow-sm shadow-slate-200/70 backdrop-blur">
                    <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                      النتائج في العرض الحالي
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {formatNumberEN(filtered.length)}
                    </div>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      من أصل {formatNumberEN(stats.all)} سجل طلب في السجل.
                    </p>
                  </div>
                </div>
              </div>

              {roleDocMissing && myRole !== "owner" ? (
                <div className="relative mt-5 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-7 text-amber-900">
                  ملاحظة: لم يتم العثور على ملف الصلاحيات للحساب داخل{" "}
                  <code>users/{user?.uid}</code> وقد تظهر بعض الإجراءات بصلاحية عرض
                  فقط.
                </div>
              ) : null}
            </section>

            {false ? (
              <>
                <div>
                  <h1 className="text-4xl font-bold mb-2">طلبات الاستثمار</h1>
                  <p className="text-muted-foreground text-lg">
                    إدارة ومتابعة طلبات الاستثمار الواردة
                  </p>

                  {/* ✅ تنبيه للحسابات القديمة (doc ناقص / role ناقص) */}
                  {roleDocMissing && myRole !== "owner" ? (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 border text-sm">
                      ملاحظة: لم يتم العثور على ملف صلاحيات لحسابك في{" "}
                      <code>users/{user?.uid}</code>. قد تظهر لك بعض الصلاحيات كعرض
                      فقط.
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <RequestSummaryTile
                title="إجمالي الطلبات"
                value={stats.all}
                helper={`${formatNumberEN(filtered.length)} سجل ضمن نتائج العرض الحالية`}
                icon={<FileText className="h-4 w-4" />}
                tone="amber"
              />
              <RequestSummaryTile
                title="الطلبات المفتوحة"
                value={stats.open}
                helper="تشمل الطلبات قيد المعالجة أو الانتظار"
                icon={<Clock3 className="h-4 w-4" />}
                tone="blue"
              />
              <RequestSummaryTile
                title="مربوطة بملف حي"
                value={clientSourceCounters.live}
                helper="الاسم والبريد من مستند المستخدم الحالي"
                icon={<RefreshCw className="h-4 w-4" />}
                tone="emerald"
              />
              <RequestSummaryTile
                title="تحتاج مراجعة ربط"
                value={
                  clientSourceCounters.requestSnapshot +
                  clientSourceCounters.unknown
                }
                helper="تعتمد على بيانات الطلب أو بيانات ناقصة"
                icon={<AlertTriangle className="h-4 w-4" />}
                tone="rose"
              />
            </div>

            <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.42)]">
              <div className="border-b border-slate-200/70 px-4 py-5 sm:px-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-4 xl:max-w-3xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                        عرض مؤسسي سريع القراءة
                      </h2>
                    </div>

                    <div className="relative w-full xl:max-w-xl">
                      <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="ابحث باسم العميل أو البريد أو المشروع أو رقم الطلب"
                        className="h-11 rounded-2xl border-slate-200 bg-slate-50/80 pr-11 text-sm shadow-none placeholder:text-slate-400"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { key: "all", label: "الكل", count: stats.all },
                        { key: "open", label: "مفتوح", count: stats.open },
                        { key: "completed", label: "مقفل", count: stats.completed },
                        { key: "rejected", label: "مرفوض", count: stats.rejected },
                      ].map(option => (
                        <Button
                          key={option.key}
                          variant="outline"
                          className={cn(
                            "h-10 rounded-2xl border px-4 text-sm shadow-none",
                            view === option.key
                              ? "border-slate-950 bg-slate-950 text-white hover:bg-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          )}
                          onClick={() => setView(option.key as typeof view)}
                        >
                          {getRequestViewLabel(String(option.key))}
                          <span
                            className={cn(
                              "mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              view === option.key
                                ? "bg-white/15 text-white"
                                : "bg-black/5 text-slate-700"
                            )}
                          >
                            {formatNumberEN(option.count)}
                          </span>
                        </Button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold tracking-[0.14em] text-slate-400">
                        نوع الطلب
                      </span>
                      {[
                        { key: "all", label: "الكل", count: stats.all },
                        {
                          key: "investment",
                          label: "طلبات استثمار",
                          count: requestKindCounters.investment,
                        },
                        {
                          key: "interest",
                          label: "طلبات اهتمام",
                          count: requestKindCounters.interest,
                        },
                      ].map(option => (
                        <Button
                          key={option.key}
                          variant="outline"
                          className={cn(
                            "h-9 rounded-2xl border px-4 text-xs shadow-none",
                            requestKindView === option.key
                              ? option.key === "interest"
                                ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                : "border-slate-950 bg-slate-950 text-white hover:bg-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          )}
                          onClick={() =>
                            setRequestKindView(
                              option.key as typeof requestKindView
                            )
                          }
                        >
                          {option.label}
                          <span
                            className={cn(
                              "mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              requestKindView === option.key
                                ? option.key === "interest"
                                  ? "bg-amber-900/10 text-amber-900"
                                  : "bg-white/15 text-white"
                                : "bg-black/5 text-slate-700"
                            )}
                          >
                            {formatNumberEN(option.count)}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                        نتائج العرض
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {formatNumberEN(filtered.length)}
                      </div>
                      <p className="mt-1 text-xs leading-6 text-slate-500">
                        من أصل {formatNumberEN(stats.all)} سجل طلب.
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-emerald-200 bg-emerald-50/70 p-4">
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-emerald-700">
                        ربط مباشر
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-emerald-950">
                        {formatNumberEN(clientSourceCounters.live)}
                      </div>
                      <p className="mt-1 text-xs leading-6 text-emerald-800/80">
                        طلبات مرتبطة حاليًا بملف المستخدم الحالي.
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-4">
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-amber-700">
                        تنبيه بيانات
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-amber-950">
                        {formatNumberEN(
                          clientSourceCounters.requestSnapshot +
                          clientSourceCounters.unknown
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-6 text-amber-900/75">
                        حالات تحتاج مراجعة الربط أو بياناتها ناقصة.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    {
                      key: "pending",
                      label: "بانتظار المراجعة",
                      count: statusCounters.pending,
                      tone: "border-amber-200 bg-amber-50 text-amber-800",
                    },
                    {
                      key: "reviewing",
                      label: "قيد المراجعة",
                      count: statusCounters.reviewing,
                      tone: "border-sky-200 bg-sky-50 text-sky-800",
                    },
                    {
                      key: "approved",
                      label: "موافقة أولية",
                      count: statusCounters.approved,
                      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
                    },
                    {
                      key: "completed",
                      label: "مكتمل أو مغلق",
                      count: statusCounters.completed,
                      tone: "border-slate-200 bg-slate-100 text-slate-700",
                    },
                  ].map(item => (
                    <div
                      key={item.key}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                        item.tone
                      )}
                    >
                      <span>{item.label}</span>
                      <span className="rounded-full bg-white/85 px-2 py-0.5 text-[11px] text-slate-700">
                        {formatNumberEN(item.count)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4 py-5 sm:px-6 sm:py-6" dir="rtl">
                <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-slate-950">
                      <MessageSquare className="h-5 w-5" />
                      <h3 className="text-lg font-semibold tracking-tight">
                        طلبات الاستثمار
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-500">
                      بطاقات مختصرة تعرض العميل، البريد، المشروع، الحالة، نوع
                      الطلب، تاريخ الطلب، آخر تحديث، والإجراء الأساسي دون ازدحام
                      بصري.
                    </p>
                  </div>

                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                    {formatNumberEN(filtered.length)} سجل
                  </div>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    جاري تحميل الطلبات...
                  </div>
                ) : filtered.length ? (
                  <div className="space-y-6">
                    <RequestCollectionSection
                      title="الطلبات الجديدة"
                      description="طلبات تحتاج متابعة مباشرة الآن. طلبات الاستثمار تبقى هنا حتى تُرفض أو تكتمل، وطلبات الاهتمام تبقى هنا حتى يتم الاطلاع عليها."
                      count={newRequests.length}
                      tone="new"
                    >
                      {newRequests.length ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          {newRequests.map(request => renderRequestCard(request))}
                        </div>
                      ) : null}
                    </RequestCollectionSection>

                    <RequestCollectionSection
                      title="الطلبات القديمة / المنتهية"
                      description="يشمل الطلبات التي خرجت من دائرة المتابعة الفورية: الاستثمارات المرفوضة أو المكتملة، وطلبات الاهتمام التي تم الاطلاع عليها."
                      count={archivedRequests.length}
                      tone="archived"
                    >
                      {archivedRequests.length ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          {archivedRequests.map(request => renderRequestCard(request))}
                        </div>
                      ) : null}
                    </RequestCollectionSection>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center">
                    <div className="text-base font-semibold text-slate-900">
                      لا توجد طلبات مطابقة للبحث أو الفلتر الحالي
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-500">
                      جرّب تغيير الفلتر أو البحث باسم العميل أو البريد أو المشروع.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {false ? (
              <>
                {/* Filters */}
                <Card className="rsg-card">
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={view === "open" ? "default" : "outline"}
                        onClick={() => setView("open")}
                      >
                        مفتوح
                      </Button>
                      <Button
                        variant={view === "completed" ? "default" : "outline"}
                        onClick={() => setView("completed")}
                      >
                        مقفل
                      </Button>
                      <Button
                        variant={view === "rejected" ? "default" : "outline"}
                        onClick={() => setView("rejected")}
                      >
                        مرفوض
                      </Button>
                      <Button
                        variant={view === "all" ? "default" : "outline"}
                        onClick={() => setView("all")}
                      >
                        الكل
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}

            <Card className="hidden rsg-card border-slate-200/80 bg-white/95 shadow-[0_22px_70px_-46px_rgba(15,23,42,0.42)]">
              <CardHeader className="gap-4 border-b border-slate-200/70 pb-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl font-semibold text-slate-950">
                    <MessageSquare className="h-5 w-5" />
                    طلبات الاستثمار
                  </CardTitle>

                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                    {formatNumberEN(filtered.length)} سجل
                  </div>
                </div>

                <p className="text-sm leading-7 text-slate-500">
                  الاسم والبريد في هذه البطاقات يتم تحديثهما من ملف المستخدم الحالي،
                  مع استخدام بيانات الطلب كبديل فقط عند غياب الربط، ومع تمييز بصري
                  واضح بين الاستثمار الفعلي والاهتمام التمهيدي.
                </p>
              </CardHeader>

              <CardContent className="pt-6" dir="rtl">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    جاري تحميل الطلبات...
                  </div>
                ) : filtered.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {filtered.map(request => renderRequestCard(request))}
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center">
                    <div className="text-base font-semibold text-slate-900">
                      لا توجد طلبات مطابقة للبحث أو الفلتر الحالي
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-500">
                      جرّب تغيير الفلتر أو البحث باسم العميل أو البريد أو المشروع.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {false ? (
              <>
                {/* Messages list */}
                <Card className="rsg-card border-slate-200/80">
                  <CardHeader className="gap-4 border-b border-slate-200/70 pb-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5" />
                        طلبات الاستثمار
                      </CardTitle>

                      <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                        {formatNumberEN(filtered.length)} سجل
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      عرض مرن وواضح للطلبات بدون أي تمرير أفقي داخل القسم.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6" dir="rtl">
                    {loading ? (
                      <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        جاري التحميل...
                      </div>
                    ) : filtered.length ? (
                      <div className="space-y-4">
                        {filtered.map(m => {
                          const badge = getStatusBadge(m.status);
                          const pid = pick(
                            m?.projectId,
                            m?.project_id,
                            m?.project?.id
                          );
                          const projectTitle = getProjectTitle(pid);
                          const amount =
                            toNum(m?.approvedAmount) ||
                            toNum(m?.amount) ||
                            toNum(m?.requestedAmount) ||
                            toNum(m?.estimatedAmount) ||
                            0;
                          const remaining = getProjectRemaining(pid);
                          const exceeded =
                            remaining != null ? amount > remaining : false;
                          const invState = m?.investmentId
                            ? { label: "تم الإنشاء", cls: "bg-emerald-700" }
                            : { label: "بانتظار الإنشاء", cls: "bg-slate-600" };
                          const touchedBy = lastTouchedBy(m);
                          const requestDate = formatDateTimeAR(
                            m.createdAt ||
                            m.created_at ||
                            m.submittedAt ||
                            m.timestamp
                          );
                          const summary = getRequestSummary(m);
                          const clientName = getClientName(m) || "—";
                          const clientEmail = getClientEmail(m);
                          const clientPhone = getClientPhone(m);

                          return (
                            <article
                              key={m.id}
                              className="rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md/40"
                            >
                              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 space-y-2">
                                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                      طلب استثمار
                                    </div>

                                    <div className="space-y-1">
                                      <h3 className="break-words text-lg font-semibold text-slate-950">
                                        {clientName}
                                      </h3>

                                      <div className="flex items-start gap-2 text-sm text-slate-600">
                                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                        <span className="min-w-0 break-words">
                                          {projectTitle}
                                        </span>
                                      </div>
                                    </div>

                                    {(clientEmail || clientPhone) && (
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                                        {clientEmail ? (
                                          <span className="break-all">
                                            {clientEmail}
                                          </span>
                                        ) : null}
                                        {clientPhone ? (
                                          <span>{clientPhone}</span>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={badge.cls}>
                                      {badge.label}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="border-slate-300 bg-white text-slate-700"
                                    >
                                      {stageLabel(m.stageRole)}
                                    </Badge>
                                    <Badge
                                      className={`${invState.cls} border-transparent shadow-none`}
                                    >
                                      {invState.label}
                                    </Badge>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4 px-4 py-4 sm:px-5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm">
                                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                      رقم الطلب
                                    </div>
                                    <div className="mt-2 break-all font-mono text-xs font-semibold text-slate-900 sm:text-sm">
                                      {requestNumber(m)}
                                    </div>
                                  </div>

                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm">
                                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                      المبلغ
                                    </div>
                                    <div className="mt-2 break-words text-sm font-semibold text-slate-900">
                                      {moneySAR(amount)}
                                    </div>
                                  </div>

                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm">
                                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                      المتبقي
                                    </div>
                                    <div className="mt-2 text-sm font-semibold text-slate-900">
                                      {remaining == null ? (
                                        <span className="text-slate-400">—</span>
                                      ) : (
                                        <span
                                          className={
                                            exceeded ? "text-rose-700" : ""
                                          }
                                        >
                                          {moneySAR(remaining)}
                                          {exceeded ? " (تجاوز)" : ""}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm">
                                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                      التاريخ
                                    </div>
                                    <div className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">
                                      {requestDate}
                                    </div>
                                  </div>

                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm">
                                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                      آخر تعديل
                                    </div>
                                    <div className="mt-2 break-all text-sm font-semibold leading-6 text-slate-900">
                                      {touchedBy}
                                    </div>
                                  </div>

                                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm">
                                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                      المشروع
                                    </div>
                                    <div className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">
                                      {projectTitle}
                                    </div>
                                  </div>
                                </div>

                                {summary ? (
                                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-4">
                                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                      ملخص الرسالة
                                    </div>
                                    <p className="mt-2 break-words text-sm leading-7 text-slate-700">
                                      {summary}
                                    </p>
                                  </div>
                                ) : null}
                              </div>

                              <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                                  <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                    الإجراءات
                                  </div>

                                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                    <Button
                                      size="sm"
                                      className="h-9 justify-center gap-2"
                                      onClick={() => navigateToRequestDetails(m.id)}
                                    >
                                      <Eye className="h-4 w-4" />
                                      مراجعة الطلب
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-9 justify-center gap-2"
                                      onClick={() => {
                                        if (!pid) {
                                          toast.warning(
                                            "لا يوجد مشروع مرتبط بهذا الطلب."
                                          );
                                          return;
                                        }
                                        window.location.href = `/admin/projects/${pid}/edit`;
                                      }}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      فتح المشروع
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-9 justify-center gap-2"
                                      onClick={() => {
                                        const clientId = pick(
                                          m?.createdByUid,
                                          m?.investorUid,
                                          m?.userId,
                                          m?.userSnapshot?.uid
                                        );
                                        if (!clientId) {
                                          toast.warning(
                                            "لا يوجد حساب عميل مرتبط بهذا الطلب."
                                          );
                                          return;
                                        }
                                        window.location.href = `/admin/client-profile?id=${clientId}`;
                                      }}
                                    >
                                      <FileText className="h-4 w-4" />
                                      ملف العميل
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 py-12 text-center text-muted-foreground">
                        لا توجد رسائل مطابقة للفلاتر الحالية
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}

          </>
        ) : null}

        {isRequestDetailsRouteActive ? (
          <section dir="rtl" className="space-y-6">
            {selectedMessage ? (
              <div className={DETAIL_DIALOG_PANEL_CLASS}>
                <div className="relative overflow-hidden border-b border-slate-200/80 px-6 py-6 sm:px-8 sm:py-7">
                  <div
                    className={cn(
                      "absolute inset-x-0 top-0 h-1.5",
                      selectedStatusMeta?.accent ||
                      (isSelectedInterestRequest
                        ? "bg-amber-500"
                        : "bg-emerald-500")
                    )}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.16),transparent_32%),radial-gradient(circle_at_top_left,rgba(20,35,58,0.08),transparent_35%)]" />

                  <div className="relative space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Button
                        variant="outline"
                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                        onClick={navigateToMessagesList}
                      >
                        <ArrowRight className="h-4 w-4" />
                        العودة إلى الطلبات
                      </Button>

                      <Button
                        variant="outline"
                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                        onClick={copySelectedRequestNumber}
                      >
                        <Copy className="h-4 w-4" />
                        نسخ رقم الطلب
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                      {detailHeaderMetrics.map(metric => (
                        <DetailSummaryMetric
                          key={metric.key}
                          label={metric.label}
                          value={metric.value}
                          helper={metric.helper}
                          icon={metric.icon}
                          mono={metric.mono}
                          strong={metric.strong}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-6 sm:p-7">
                  {renderDetailWorkflowStepper()}
                  {renderDetailContextRow()}
                  {renderDetailPrimaryPanel()}
                  {renderDetailSecondaryTabs()}
                  {renderDetailAdvancedActions()}

                  {false ? (
                    <div className="grid grid-cols-1 gap-6">
                      <DetailSection
                        title="بيانات العميل"
                        description="عرض مرتب لبيانات العميل وجهة الربط وقنوات التواصل المتاحة داخل النظام."
                        badge={
                          <Badge
                            className={cn(
                              DETAIL_PILL_BASE_CLASS,
                              selectedClient?.sourceTone
                            )}
                          >
                            {selectedClient?.sourceLabel || "بيانات الطلب"}
                          </Badge>
                        }
                      >
                        <div className="flex flex-col gap-5 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.2)] lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 items-start gap-4">
                            <div
                              className={cn(
                                "flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] text-2xl font-semibold shadow-[0_18px_34px_-24px_rgba(15,23,42,0.2)]",
                                isSelectedInterestRequest
                                  ? "border border-amber-200 bg-amber-50 text-amber-900"
                                  : "bg-slate-950 text-white"
                              )}
                            >
                              {String(selectedClient?.clientName || "ع")
                                .trim()
                                .charAt(0) || "ع"}
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="break-words text-xl font-semibold text-slate-950">
                                  {selectedClient?.clientName ||
                                    "مستخدم غير معروف"}
                                </h3>
                                <Badge
                                  className={cn(
                                    DETAIL_COMPACT_PILL_BASE_CLASS,
                                    "border-slate-200 bg-slate-100 text-slate-700"
                                  )}
                                >
                                  {selectedClient?.clientRoleLabel || "عميل"}
                                </Badge>
                                {selectedClient?.sourceKey === "live_user" ? (
                                  <Badge
                                    className={cn(
                                      DETAIL_COMPACT_PILL_BASE_CLASS,
                                      "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    )}
                                  >
                                    موثق بالنظام
                                  </Badge>
                                ) : null}
                              </div>

                              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                                {selectedClient?.sourceHelper}
                              </p>

                              {selectedClient?.clientId ? (
                                <div className="mt-3 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                                  معرّف العميل:
                                  <span className="mr-1 font-mono text-slate-700">
                                    {selectedClient?.clientId}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              className={DETAIL_OUTLINE_BUTTON_CLASS}
                              onClick={openSelectedClientProfile}
                            >
                              <FileText className="h-4 w-4" />
                              فتح ملف العميل
                            </Button>
                            <Button
                              variant="outline"
                              className={DETAIL_OUTLINE_BUTTON_CLASS}
                              onClick={openSelectedProject}
                            >
                              <ExternalLink className="h-4 w-4" />
                              فتح المشروع
                            </Button>
                            <Button
                              variant="outline"
                              className={DETAIL_OUTLINE_BUTTON_CLASS}
                              onClick={copySelectedRequestNumber}
                            >
                              <Copy className="h-4 w-4" />
                              نسخ رقم الطلب
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <DetailSummaryMetric
                            label="البريد الإلكتروني"
                            value={
                              selectedContactEmail ? (
                                <span dir="ltr" className="break-all">
                                  {selectedContactEmail}
                                </span>
                              ) : (
                                "—"
                              )
                            }
                            icon={<Mail className="h-3.5 w-3.5" />}
                          />
                          <DetailSummaryMetric
                            label="رقم الجوال"
                            value={
                              selectedContactPhone ? (
                                <span dir="ltr">{selectedContactPhone}</span>
                              ) : (
                                "—"
                              )
                            }
                            icon={<Phone className="h-3.5 w-3.5" />}
                          />
                          <DetailSummaryMetric
                            label="مصدر البيانات"
                            value={selectedClient?.sourceLabel || "—"}
                            helper={selectedClient?.sourceHelper || undefined}
                            icon={<MessageSquare className="h-3.5 w-3.5" />}
                          />
                          <DetailSummaryMetric
                            label="حالة الملف"
                            value={
                              selectedClient?.sourceKey === "live_user"
                                ? "ملف مرتبط وموثق"
                                : "بيانات محفوظة داخل الطلب"
                            }
                            icon={<ShieldCheck className="h-3.5 w-3.5" />}
                            strong
                          />
                        </div>
                      </DetailSection>

                      <DetailSection
                        title="بيانات الطلب"
                        description="ملخص منظم للطلب مع الرسالة أو الوصف والمشروع المرتبط وطبيعة المسار الحالي."
                        badge={
                          <Badge
                            className={cn(
                              DETAIL_PILL_BASE_CLASS,
                              "border-slate-200 bg-slate-100 text-slate-700"
                            )}
                          >
                            {selectedRequestKind?.shortLabel || "طلب"}
                          </Badge>
                        }
                      >
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <DetailSummaryMetric
                            label="رقم الطلب"
                            value={requestNumber(selectedMessage)}
                            icon={<FileText className="h-3.5 w-3.5" />}
                            mono
                            strong
                          />
                          <DetailSummaryMetric
                            label="نوع الطلب"
                            value={selectedRequestKind?.label || "—"}
                            icon={<MessageSquare className="h-3.5 w-3.5" />}
                          />
                          <DetailSummaryMetric
                            label="الحالة"
                            value={selectedStatusMeta?.label || "—"}
                            icon={<Eye className="h-3.5 w-3.5" />}
                            strong
                          />
                          <DetailSummaryMetric
                            label="تاريخ الإنشاء"
                            value={formatDateTimeAR(selectedCreatedAtValue)}
                            icon={<CalendarDays className="h-3.5 w-3.5" />}
                          />
                          <DetailSummaryMetric
                            label="آخر تحديث"
                            value={formatDateTimeAR(selectedUpdatedAtValue)}
                            helper={formatRequestTimeLabel(selectedUpdatedAtValue)}
                            icon={<RefreshCw className="h-3.5 w-3.5" />}
                          />
                          <DetailSummaryMetric
                            label="مصدر الطلب"
                            value={pick(
                              selectedMessage?.source,
                              selectedClient?.sourceLabel,
                              "—"
                            )}
                            icon={<MessageSquare className="h-3.5 w-3.5" />}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                          <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] p-5 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.18)]">
                            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
                              رسالة العميل / الوصف
                            </div>
                            <p className="mt-3 text-sm leading-8 text-slate-700">
                              {selectedRequestSummary ||
                                "لا توجد رسالة مفصلة مرفقة مع هذا الطلب."}
                            </p>
                          </div>

                          <div
                            className={cn(
                              "rounded-[24px] border px-5 py-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]",
                              isSelectedInterestRequest
                                ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)]"
                                : "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(255,255,255,0.98)_100%)]"
                            )}
                          >
                            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
                              {isSelectedInterestRequest
                                ? "قراءة الاهتمام"
                                : "قراءة الاستثمار"}
                            </div>
                            <div className="mt-3 space-y-3">
                              <DetailSummaryMetric
                                label="المشروع"
                                value={selectedProjectTitle}
                                icon={<Building2 className="h-3.5 w-3.5" />}
                                strong
                                className="border-transparent bg-white/85 shadow-none"
                              />
                              {isSelectedInterestRequest ? (
                                <DetailSummaryMetric
                                  label="وضع المتابعة"
                                  value={selectedInterestReviewMeta?.label || "جديد"}
                                  helper={selectedInterestReviewMeta?.helperText}
                                  icon={<Eye className="h-3.5 w-3.5" />}
                                  className="border-transparent bg-white/85 shadow-none"
                                />
                              ) : (
                                <>
                                  <DetailSummaryMetric
                                    label="المبلغ"
                                    value={moneySAR(selectedAmount)}
                                    icon={<Wallet className="h-3.5 w-3.5" />}
                                    strong
                                    className="border-transparent bg-white/85 shadow-none"
                                  />
                                  <DetailSummaryMetric
                                    label="المتبقي بالمشروع"
                                    value={
                                      selectedRemaining == null
                                        ? "—"
                                        : selectedAmountExceeded
                                          ? `${moneySAR(selectedRemaining)} (تجاوز)`
                                          : moneySAR(selectedRemaining)
                                    }
                                    icon={<Building2 className="h-3.5 w-3.5" />}
                                    className="border-transparent bg-white/85 shadow-none"
                                  />
                                  <DetailSummaryMetric
                                    label="سجل الاستثمار"
                                    value={
                                      selectedMessage?.investmentId
                                        ? "تم إنشاء سجل الاستثمار"
                                        : "بانتظار إنشاء السجل"
                                    }
                                    helper={
                                      selectedMessage?.investmentId
                                        ? `رقم السجل ${selectedMessage.investmentId}`
                                        : undefined
                                    }
                                    icon={<ShieldCheck className="h-3.5 w-3.5" />}
                                    className="border-transparent bg-white/85 shadow-none"
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div
                          className={cn(
                            "rounded-[24px] border px-5 py-4 text-sm leading-8 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.2)]",
                            isSelectedInterestRequest
                              ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-amber-950"
                              : "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-emerald-950"
                          )}
                        >
                          {isSelectedInterestRequest
                            ? selectedInterestReviewMeta?.helperText ||
                            selectedRequestKind?.helperText
                            : selectedMessage?.investmentId
                              ? "تم ربط هذا الطلب بسجل استثمار فعلي، لذلك يظهر هنا كطلب استثماري تشغيلي بمرحلة أوضح ومستندات مرتبطة."
                              : "هذا الطلب ما زال في المرحلة السابقة لإنشاء الاستثمار، لذلك يتم التركيز على المشروع والمبلغ والقرار المطلوب من الفريق."}
                        </div>
                      </DetailSection>

                      <DetailSection
                        title="ملخص القرار والنشاط والإجراءات"
                        description="لوحة تشغيلية تجمع القرار الحالي، سجل الحركة، والملاحظات الداخلية مع الإجراءات المناسبة حسب نوع الطلب."
                        badge={
                          selectedTrackingMeta ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                className={cn(
                                  DETAIL_PILL_BASE_CLASS,
                                  selectedTrackingMeta?.tone
                                )}
                              >
                                {selectedTrackingMeta?.label}
                              </Badge>
                              {selectedTrackingSlaMeta ? (
                                <Badge
                                  className={cn(
                                    DETAIL_COMPACT_PILL_BASE_CLASS,
                                    selectedTrackingSlaMeta?.className
                                  )}
                                >
                                  {selectedTrackingSlaMeta?.label}
                                </Badge>
                              ) : null}
                            </div>
                          ) : undefined
                        }
                      >
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                          <div
                            className={cn(
                              "rounded-[24px] border px-5 py-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.22)]",
                              isSelectedInterestRequest
                                ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-amber-950"
                                : "border-slate-900/10 bg-[linear-gradient(135deg,rgba(11,23,38,0.98)_0%,rgba(16,32,58,0.96)_70%,rgba(255,255,255,0.06)_135%)] text-white"
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2.5">
                              {selectedTrackingMeta ? (
                                <Badge
                                  className={cn(
                                    DETAIL_PILL_BASE_CLASS,
                                    selectedTrackingMeta?.tone
                                  )}
                                >
                                  {selectedTrackingMeta?.label}
                                </Badge>
                              ) : null}
                              {selectedTrackingSlaMeta ? (
                                <Badge
                                  className={cn(
                                    DETAIL_COMPACT_PILL_BASE_CLASS,
                                    selectedTrackingSlaMeta?.className
                                  )}
                                >
                                  {selectedTrackingSlaMeta?.label}
                                </Badge>
                              ) : null}
                              {!isSelectedInterestRequest && selectedStatusMeta ? (
                                <Badge
                                  className={cn(
                                    DETAIL_PILL_BASE_CLASS,
                                    selectedStatusMeta?.tone
                                  )}
                                >
                                  {selectedStatusMeta?.label}
                                </Badge>
                              ) : null}

                              {isSelectedInterestRequest ? null : (
                                <Badge className={DETAIL_STAGE_PILL_CLASS}>
                                  {selectedStageMeta?.label || "—"}
                                </Badge>
                              )}
                            </div>

                            <div className="mt-4 text-xl font-semibold leading-8 text-current">
                              {selectedNextActionSummary.label}
                            </div>
                            <p className="mt-2 text-sm leading-8 text-current/80">
                              {selectedNextActionSummary.helper}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <DetailSummaryMetric
                              label="آخر من عدّل"
                              value={selectedLastActor?.name || "—"}
                              helper={selectedLastActor?.roleLabel || undefined}
                              icon={<RefreshCw className="h-3.5 w-3.5" />}
                              strong
                            />
                            <DetailSummaryMetric
                              label="آخر تحديث"
                              value={formatDateTimeAR(selectedUpdatedAtValue)}
                              helper={formatRequestTimeLabel(selectedUpdatedAtValue)}
                              icon={<CalendarDays className="h-3.5 w-3.5" />}
                            />
                          </div>
                        </div>

                        <div className={DETAIL_INLINE_PANEL_CLASS}>
                          <Label className={DETAIL_INLINE_LABEL_CLASS}>
                            ملاحظات داخلية
                          </Label>
                          <Textarea
                            value={internalNotes}
                            onChange={e => setInternalNotes(e.target.value)}
                            placeholder="ملاحظات للإدارة فقط..."
                            disabled={isLockedFinal || myRole === "client"}
                            className={DETAIL_TEXTAREA_CLASS}
                          />
                          <p className="mt-3 text-xs leading-6 text-slate-500">
                            هذا الحقل مخصص للملاحظات الداخلية والتنظيمية فقط.
                          </p>
                        </div>

                        {isSelectedInterestRequest ? (
                          <div className={DETAIL_ALERT_CLASS}>
                            {selectedInterestReviewMeta?.helperText ||
                              "يتم التعامل مع هذا السجل كطلب اهتمام تمهيدي، لذلك تكفي القراءة والتوثيق والتواصل دون دورة استثمار كاملة."}
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
                            السجل الزمني / آخر التحديثات
                          </div>
                          {selectedTimelineEvents.length ? (
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                              {selectedTimelineEvents.slice(0, 4).map(item => (
                                <DetailTimelineItem
                                  key={item.id}
                                  title={item.title}
                                  note={item.note}
                                  actorName={item.actor.name}
                                  actorRole={item.actor.roleLabel}
                                  timeLabel={item.timeLabel}
                                  dateLabel={item.atLabel}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm leading-7 text-slate-500">
                              لا توجد أنشطة إضافية مسجلة على هذا الطلب حتى الآن.
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Button
                            className={cn(
                              DETAIL_LIGHT_SOLID_BUTTON_CLASS,
                              "w-full"
                            )}
                            onClick={handleSaveNotesOnly}
                            disabled={isLockedFinal || myRole === "client"}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            حفظ الملاحظات
                          </Button>
                          {canStartRequestReview ? (
                            <Button
                              className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-yellow-700 hover:bg-yellow-800`}
                              onClick={startRequestReview}
                              disabled={isLockedFinal}
                            >
                              <Clock3 className="w-4 h-4" />
                              بدء المراجعة
                            </Button>
                          ) : null}

                          {canInitialApproveRequest ? (
                            <Button
                              className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-indigo-700 hover:bg-indigo-800`}
                              onClick={initialApproveRequest}
                              disabled={isLockedFinal}
                            >
                              <ShieldCheck className="w-4 h-4" />
                              موافقة أولية
                            </Button>
                          ) : null}

                          {canCreateInvestmentFromRequest ? (
                            <Button
                              className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-blue-700 hover:bg-blue-800`}
                              onClick={approveRequestAndCreateInvestment}
                              disabled={approveCreateBusy || isLockedFinal}
                            >
                              {approveCreateBusy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                              إنشاء الاستثمار
                            </Button>
                          ) : null}

                          {canVerifySignedContract ? (
                            <Button
                              className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-amber-700 hover:bg-amber-800`}
                              onClick={verifySignedContract}
                              disabled={isLockedFinal || finalizeBusy}
                            >
                              {finalizeBusy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-4 h-4" />
                              )}
                              اعتماد العقد الموقّع
                            </Button>
                          ) : null}

                          {canFinalize ? (
                            <Button
                              className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-emerald-700 hover:bg-emerald-800`}
                              onClick={activateInvestmentAfterApproval}
                              disabled={isLockedFinal || finalizeBusy}
                            >
                              {finalizeBusy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Building2 className="w-4 h-4" />
                              )}
                              إقفال نهائي
                            </Button>
                          ) : null}

                          {isSelectedInvestmentRequest ? (
                            <>
                              <Button
                                className={cn(
                                  DETAIL_DANGER_BUTTON_CLASS,
                                  "w-full"
                                )}
                                onClick={rejectInvestmentRequest}
                                disabled={isLockedFinal || !canManageMessages}
                              >
                                <AlertTriangle className="w-4 h-4" />
                                رفض الطلب
                              </Button>

                              <Button
                                variant="outline"
                                className={cn(
                                  DETAIL_OUTLINE_BUTTON_CLASS,
                                  "w-full"
                                )}
                                onClick={reopenMessage}
                                disabled={
                                  reopenBusy ||
                                  myRole !== "owner" ||
                                  !canManageMessages
                                }
                              >
                                {reopenBusy ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Clock3 className="w-4 h-4" />
                                )}
                                إعادة فتح (للمسؤول التقني)
                              </Button>
                            </>
                          ) : null}
                        </div>

                        <div className="border-t border-slate-200/80 pt-4">
                          <div className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-slate-400">
                            أدوات سريعة
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Button
                              variant="outline"
                              className={DETAIL_OUTLINE_BUTTON_CLASS}
                              onClick={openSelectedClientProfile}
                            >
                              <FileText className="h-4 w-4" />
                              فتح ملف العميل
                            </Button>

                            <Button
                              variant="outline"
                              className={DETAIL_OUTLINE_BUTTON_CLASS}
                              onClick={openSelectedProject}
                            >
                              <ExternalLink className="h-4 w-4" />
                              فتح المشروع
                            </Button>

                            {selectedContactEmail ? (
                              <a
                                className="inline-flex"
                                href={`mailto:${selectedContactEmail}`}
                              >
                                <Button
                                  variant="outline"
                                  className={`${DETAIL_OUTLINE_BUTTON_CLASS} w-full`}
                                >
                                  <Mail className="h-4 w-4" />
                                  إرسال بريد
                                </Button>
                              </a>
                            ) : null}

                            {selectedContactPhone ? (
                              <a
                                className="inline-flex"
                                href={`tel:${selectedContactPhone}`}
                              >
                                <Button
                                  variant="outline"
                                  className={`${DETAIL_OUTLINE_BUTTON_CLASS} w-full`}
                                >
                                  <Phone className="h-4 w-4" />
                                  اتصال مباشر
                                </Button>
                              </a>
                            ) : null}

                            <Button
                              variant="outline"
                              className={DETAIL_OUTLINE_BUTTON_CLASS}
                              onClick={copySelectedRequestNumber}
                            >
                              <Copy className="h-4 w-4" />
                              نسخ رقم الطلب
                            </Button>
                          </div>
                        </div>
                      </DetailSection>

                      {isSelectedInvestmentRequest ? (
                        <Card className={`rsg-card ${DETAIL_SECTION_CARD_CLASS}`}>
                          <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
                            <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>
                              مستندات الاستثمار
                            </CardTitle>
                          </CardHeader>
                          <CardContent
                            className={`${DETAIL_SECTION_CONTENT_CLASS} space-y-5`}
                          >
                            {renderDocumentsSectionBody({ showUpload: true })}
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <Card className="rsg-card border-slate-200/80 bg-white/95 shadow-[0_22px_70px_-46px_rgba(15,23,42,0.42)]">
                <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center sm:px-10">
                  {loading ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                      <div className="text-base font-semibold text-slate-900">
                        جاري تحميل تفاصيل الطلب...
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-semibold text-slate-900">
                        تعذر العثور على الطلب المطلوب.
                      </div>
                      <p className="max-w-xl text-sm leading-7 text-slate-500">
                        قد يكون الرابط غير صحيح أو أن الطلب لم يعد متاحًا ضمن السجلات الحالية.
                      </p>
                      <Button
                        variant="outline"
                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                        onClick={navigateToMessagesList}
                      >
                        <ArrowRight className="h-4 w-4" />
                        العودة إلى الطلبات
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
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

/* =========================
  Small components
========================= */

function RequestSummaryTile({
  title,
  value,
  helper,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon?: ReactNode;
  tone: "amber" | "blue" | "emerald" | "rose";
}) {
  const toneMap = {
    amber: "border-amber-200 bg-amber-50/80 text-amber-800",
    blue: "border-sky-200 bg-sky-50/80 text-sky-800",
    emerald: "border-emerald-200 bg-emerald-50/80 text-emerald-800",
    rose: "border-rose-200 bg-rose-50/80 text-rose-800",
  } as const;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/95 p-4 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.32)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
            {title}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {formatNumberEN(value)}
          </div>
        </div>

        {icon ? (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl border",
              toneMap[tone]
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function RequestCollectionSection({
  title,
  description,
  count,
  tone,
  children,
}: {
  title: string;
  description: string;
  count: number;
  tone: "new" | "archived";
  children?: ReactNode;
}) {
  const toneMap = {
    new: {
      shell:
        "border-sky-200/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.88)_0%,rgba(255,255,255,0.98)_22%,#ffffff_100%)]",
      badge: "border-sky-200 bg-sky-50 text-sky-800",
      empty: "border-sky-200/70 bg-sky-50/60 text-sky-900",
    },
    archived: {
      shell:
        "border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(255,255,255,0.98)_24%,#ffffff_100%)]",
      badge: "border-slate-200 bg-slate-100 text-slate-700",
      empty: "border-slate-200/80 bg-slate-50/70 text-slate-800",
    },
  } as const;

  return (
    <section
      className={cn(
        "rounded-[26px] border px-4 py-5 sm:px-5",
        toneMap[tone].shell
      )}
    >
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-200/70 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-lg font-semibold tracking-tight text-slate-950">
            {title}
          </h4>
          <p className="mt-1 text-sm leading-7 text-slate-500">
            {description}
          </p>
        </div>

        <div
          className={cn(
            "inline-flex w-fit items-center rounded-full border px-3 py-1 text-sm font-semibold",
            toneMap[tone].badge
          )}
        >
          {formatNumberEN(count)} سجل
        </div>
      </div>

      {count ? (
        children
      ) : (
        <div
          className={cn(
            "rounded-[20px] border border-dashed px-4 py-8 text-center text-sm leading-7",
            toneMap[tone].empty
          )}
        >
          لا توجد عناصر في هذا القسم ضمن نتائج البحث الحالية.
        </div>
      )}
    </section>
  );
}

function DetailSection({
  title,
  description,
  badge,
  children,
  className,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rsg-card", DETAIL_SECTION_CARD_CLASS, className)}>
      <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>{title}</CardTitle>
            {description ? (
              <p className="text-sm leading-7 text-slate-500">{description}</p>
            ) : null}
          </div>

          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      </CardHeader>

      <CardContent className={DETAIL_SECTION_CONTENT_CLASS}>{children}</CardContent>
    </Card>
  );
}

function DetailSummaryMetric({
  label,
  value,
  helper,
  icon,
  strong = false,
  mono = false,
  className,
}: {
  label: string;
  value: any;
  helper?: string;
  icon?: ReactNode;
  strong?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.95)_100%)] px-4 py-3.5 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.34)]",
        className
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-400">
        {icon ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            {icon}
          </span>
        ) : null}
        <span>{label}</span>
      </div>

      <div
        className={cn(
          "mt-3 break-words text-[14px] leading-6 text-slate-700",
          strong ? "text-[15px] font-semibold text-slate-950" : "font-medium",
          mono ? "font-mono text-[12px] sm:text-[13px]" : ""
        )}
      >
        {value ?? "—"}
      </div>

      {helper ? (
        <p className="mt-2 text-xs leading-6 text-slate-500">{helper}</p>
      ) : null}
    </div>
  );
}

function DetailDocumentsMetricCard({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.22)]">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            {icon}
          </span>
        ) : null}
        <span>{label}</span>
      </div>

      <div className="mt-3 min-h-[2.75rem]">{children}</div>
    </div>
  );
}

function DetailBinaryBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <Badge
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium shadow-none",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-gray-200 bg-gray-100 text-gray-500"
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

function DetailContractStatusBadges({
  status,
  followupLabel,
}: {
  status: any;
  followupLabel?: string;
}) {
  const normalizedStatus = String(status || "")
    .trim()
    .toLowerCase();

  const statusIcon =
    normalizedStatus === "under_review" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : normalizedStatus === "approved" ||
      normalizedStatus === "signed" ||
      normalizedStatus === "signed_uploaded" ? (
      <ShieldCheck className="h-3.5 w-3.5" />
    ) : (
      <Clock3 className="h-3.5 w-3.5" />
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-none",
          getContractStatusClass(status)
        )}
      >
        {statusIcon}
        <span>{getContractStatusLabel(status)}</span>
      </Badge>

      {followupLabel ? (
        <Badge className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 shadow-none">
          {followupLabel}
        </Badge>
      ) : null}
    </div>
  );
}

function DetailDocumentFileCard({
  title,
  available,
  fileName,
  viewUrl,
  downloadUrl,
  emptyTitle,
  emptyDescription,
  alertText,
}: {
  title: string;
  available: boolean;
  fileName: string;
  viewUrl?: string | null;
  downloadUrl?: string | null;
  emptyTitle: string;
  emptyDescription: string;
  alertText?: string;
}) {
  const isSignedDocument = title.includes("الموق");
  const description = isSignedDocument
    ? "نسخة العقد بعد التوقيع لمراجعتها واستكمال التفعيل"
    : "نسخة معتمدة للمراجعة قبل التوقيع";
  const footerLabel = isSignedDocument
    ? available
      ? "مرفوع من المستثمر"
      : "بانتظار رفع المستثمر"
    : "داخل المنصة";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.995)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_28px_60px_-40px_rgba(15,23,42,0.28)]">
      <div className="absolute left-6 top-6">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold leading-none",
            available
              ? "border-slate-200 bg-slate-50 text-slate-500"
              : "border-gray-200 bg-gray-100 text-gray-500"
          )}
        >
          {available ? "PDF" : "لا يوجد"}
        </span>
      </div>

      <div className="absolute right-6 top-5 flex h-11 w-11 -translate-y-0.5 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_20px_34px_-20px_rgba(15,23,42,0.55)]">
        <FileText className="h-5 w-5" />
      </div>

      <div className="flex min-h-[300px] flex-col pt-12">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xl font-semibold tracking-tight text-slate-950">{title}</div>
            <div className="text-sm leading-6 text-slate-500">{description}</div>
          </div>

          {available ? (
            <div className="break-words text-[15px] font-medium leading-7 text-slate-700">
              {fileName}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200/80">
                <FileText className="h-[18px] w-[18px]" />
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{emptyTitle}</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">{emptyDescription}</div>
            </div>
          )}

          {alertText ? <div className={cn(DETAIL_ALERT_CLASS, "!rounded-2xl")}>{alertText}</div> : null}
        </div>

        <div className="mt-auto pt-6">
          <div className="mb-4 h-px bg-slate-200/80" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">{footerLabel}</div>

            {available ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {viewUrl ? (
                  <a href={viewUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-full rounded-full border border-primary bg-white px-4 text-primary shadow-sm hover:bg-primary/10 hover:text-primary sm:w-auto"
                    >
                      <Eye className="h-4 w-4 text-current" />
                      عرض
                    </Button>
                  </a>
                ) : null}

                {downloadUrl ? (
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto"
                  >
                    <Button
                      size="sm"
                      className="h-10 w-full rounded-full bg-primary px-4 text-primary-foreground shadow-[0_14px_28px_-16px_rgba(15,23,42,0.4)] hover:bg-primary/90 sm:w-auto"
                    >
                      <Download className="h-4 w-4 text-current" />
                      تنزيل
                    </Button>
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailContractUploadPanel({
  file,
  onFileChange,
  disabled = false,
  busy = false,
  buttonLabel,
  onSubmit,
  submitDisabled = false,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  busy?: boolean;
  buttonLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileName = String(file?.name || "").trim();
  const hasFile = Boolean(fileName);

  useEffect(() => {
    if (!file && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [file]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.22)]">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        disabled={disabled}
        onChange={e => onFileChange(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        className={cn(
          "group w-full rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          hasFile
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-slate-300/80 bg-muted/30",
          disabled
            ? "cursor-not-allowed opacity-70"
            : "hover:border-primary hover:bg-muted/10"
        )}
        onClick={() => {
          if (disabled) return;
          if (inputRef.current) {
            inputRef.current.value = "";
            inputRef.current.click();
          }
        }}
        disabled={disabled}
      >
        <div
          className={cn(
            "mx-auto flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm",
            hasFile
              ? "border-emerald-200 text-emerald-700"
              : "border-slate-200 text-slate-600 group-hover:border-primary group-hover:text-primary"
          )}
        >
          {hasFile ? (
            <FileText className="h-7 w-7" />
          ) : (
            <Upload className="h-7 w-7" />
          )}
        </div>

        <div className="mt-4 break-words text-base font-semibold text-slate-950">
          {hasFile ? fileName : "اسحب الملف هنا أو اضغط للاختيار"}
        </div>

        <div className="mt-1 text-sm text-slate-500">
          {hasFile ? "ملف PDF جاهز للرفع. اضغط لتغييره." : "PDF فقط"}
        </div>
      </button>

      <Button
        className={`w-full sm:w-auto ${DETAIL_SOLID_BUTTON_CLASS} bg-blue-700 hover:bg-blue-800`}
        onClick={onSubmit}
        disabled={submitDisabled}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {buttonLabel}
      </Button>
    </div>
  );
}

function DetailTimelineItem({
  title,
  note,
  actorName,
  actorRole,
  timeLabel,
  dateLabel,
}: {
  title: string;
  note?: string | null;
  actorName: string;
  actorRole: string;
  timeLabel: string;
  dateLabel: string;
}) {
  return (
    <div className="relative rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] px-4 py-4 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.24)]">
      <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-slate-900" />

      <div className="pr-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold leading-6 text-slate-950">
              {title}
            </h4>
            <div className="mt-1 text-xs leading-6 text-slate-500">
              {actorName} • {actorRole}
            </div>
          </div>

          <div className="text-xs leading-6 text-slate-500 sm:text-left">
            <div>{timeLabel}</div>
            <div>{dateLabel}</div>
          </div>
        </div>

        {note ? (
          <p className="mt-3 text-sm leading-7 text-slate-600">{note}</p>
        ) : null}
      </div>
    </div>
  );
}

function RequestCardMetric({
  label,
  value,
  icon,
  strong = false,
  mono = false,
}: {
  label: string;
  value: any;
  icon?: ReactNode;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[16px] border border-slate-200/80 bg-slate-50/90 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-slate-400">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        <span>{label}</span>
      </div>

      <div
        className={cn(
          "mt-1.5 break-words text-[13px] leading-5 text-slate-800",
          strong ? "font-semibold text-slate-950" : "font-medium",
          mono ? "font-mono text-[11px] sm:text-xs" : ""
        )}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className={DETAIL_INPUT_ROW_CLASS}>
      <div className={DETAIL_INPUT_LABEL_CLASS}>{label}</div>

      <div className={DETAIL_INPUT_VALUE_CLASS}>{value ?? "—"}</div>
    </div>
  );
}
