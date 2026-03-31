/* eslint-disable @typescript-eslint/no-unused-vars */
// client/src/pages/admin/MessagesManagement.tsx
import {
  useDeferredValue,
  useEffect,
  useMemo,
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
  uploadInvestmentDocument,
  type UploadDocumentResult,
} from "@/lib/documentUploadService";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  MessageSquare,
  Mail,
  Phone,
  Eye,
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CLIENT_WORKFLOW_COPY,
  getClientContractStatusLabel,
} from "@shared/investmentLifecycle";

/* =========================
  ✅ Switch: Disable contracts/files now
  - True = لا عقود + لا رفع + لا signed (ترحيل يدوي)
  - False = يرجع نظام العقود القديم بالكامل
========================= */
const CONTRACTS_DISABLED = false;

const DETAIL_DIALOG_PANEL_CLASS =
  "overflow-x-hidden rounded-[28px] border border-slate-800/70 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.98)_0%,_rgba(15,23,42,0.98)_45%,_rgba(2,6,23,1)_100%)] text-slate-50 shadow-2xl shadow-slate-950/40";
const DETAIL_SECTION_CARD_CLASS =
  "overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.92))] shadow-lg shadow-slate-950/20 backdrop-blur-md";
const DETAIL_SECTION_HEADER_CLASS = "border-b border-white/10 px-6 pb-4 pt-5";
const DETAIL_SECTION_TITLE_CLASS =
  "text-[1.02rem] font-semibold tracking-tight text-slate-50";
const DETAIL_SECTION_CONTENT_CLASS = "space-y-5 px-6 pb-6 pt-5 text-slate-100";
const DETAIL_INLINE_PANEL_CLASS =
  "rounded-[20px] border border-slate-700/70 bg-slate-950/55 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";
const DETAIL_INLINE_LABEL_CLASS =
  "mb-3 text-[11px] font-medium tracking-[0.14em] text-slate-300";
const DETAIL_INPUT_ROW_CLASS =
  "grid grid-cols-[120px_1fr] items-start gap-4 rounded-[20px] border border-slate-700/70 bg-slate-950/55 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";
const DETAIL_INPUT_LABEL_CLASS =
  "pt-1 text-right text-[11px] font-medium tracking-[0.14em] text-slate-300";
const DETAIL_INPUT_VALUE_CLASS =
  "break-words text-right text-[15px] font-semibold leading-7 text-slate-50";
const DETAIL_SUBCARD_CLASS =
  "space-y-3 rounded-[22px] border border-slate-700/70 bg-slate-950/60 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";
const DETAIL_SUBCARD_TITLE_CLASS = "text-sm font-semibold text-slate-50";
const DETAIL_SUBCARD_VALUE_CLASS =
  "break-words text-sm font-medium leading-7 text-slate-100";
const DETAIL_HELP_TEXT_CLASS = "text-sm leading-7 text-slate-300";
const DETAIL_ALERT_CLASS =
  "rounded-[18px] border border-amber-300/20 bg-amber-500/10 px-3.5 py-3 text-xs leading-6 text-amber-100";
const DETAIL_PILL_BASE_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border px-3.5 text-xs font-semibold leading-none tracking-[0.01em]";
const DETAIL_COMPACT_PILL_BASE_CLASS =
  "inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[11px] font-semibold leading-none tracking-[0.01em]";
const DETAIL_STAGE_PILL_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border border-slate-600/80 bg-slate-900/70 px-3.5 text-xs font-semibold leading-none tracking-[0.01em] text-slate-100";
const DETAIL_TEXTAREA_CLASS =
  "min-h-[120px] rounded-[20px] border-slate-700/70 bg-slate-950/60 px-4 py-3 text-sm leading-7 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] placeholder:text-slate-400";
const DETAIL_BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const DETAIL_OUTLINE_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 border-slate-700/70 bg-slate-900/70 text-slate-100 shadow-none hover:bg-slate-800/85 hover:text-white`;
const DETAIL_LIGHT_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 bg-white text-slate-950 shadow-lg shadow-slate-950/20 hover:bg-slate-100`;
const DETAIL_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 text-white shadow-lg shadow-slate-950/20`;
const DETAIL_DANGER_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 bg-rose-600 text-white shadow-lg shadow-rose-950/20 hover:bg-rose-500`;

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

function buildR2DownloadUrl(path: any, forceDownload = false) {
  const objectPath = String(path || "").trim();
  if (!objectPath) return "";

  const explicitDownloadBase = String(
    import.meta.env.VITE_R2_DOWNLOAD_WORKER_URL || ""
  ).trim();
  const uploadWorkerUrl = String(
    import.meta.env.VITE_R2_UPLOAD_WORKER_URL || ""
  ).trim();
  const baseUrl = explicitDownloadBase || uploadWorkerUrl;
  if (!baseUrl) return "";

  try {
    const url = new URL(baseUrl);
    url.pathname = "/download";
    url.search = "";
    url.hash = "";
    url.searchParams.set("path", objectPath);
    if (forceDownload) {
      url.searchParams.set("download", "1");
    }
    return url.toString();
  } catch {
    return "";
  }
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
    draft: "border-slate-600/70 bg-slate-800/70 text-slate-200",
    sent: "border-sky-400/30 bg-sky-500/10 text-sky-200",
    pending_signature: "border-amber-400/35 bg-amber-500/10 text-amber-200",
    signed: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
    issued: "border-sky-400/30 bg-sky-500/10 text-sky-200",
    signed_uploaded: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
    under_review: "border-violet-400/35 bg-violet-500/10 text-violet-200",
    approved: "border-emerald-300/35 bg-emerald-500/12 text-emerald-100",
  };
  return map[s] || "border-slate-600/70 bg-slate-800/70 text-slate-200";
}

function getDetailRequestStatusClass(status: any): string {
  const normalizedStatus = normalizeRequestStatus(status);
  const map: Record<string, string> = {
    pending: "border-amber-400/35 bg-amber-500/10 text-amber-200",
    reviewing: "border-sky-400/30 bg-sky-500/10 text-sky-200",
    approved: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
    completed: "border-emerald-300/30 bg-emerald-500/12 text-emerald-100",
    rejected: "border-rose-400/35 bg-rose-500/10 text-rose-200",
    no_account: "border-rose-300/30 bg-rose-500/12 text-rose-200",
    closed: "border-slate-600/70 bg-slate-800/70 text-slate-200",
  };

  return cn(
    DETAIL_PILL_BASE_CLASS,
    map[normalizedStatus] ||
      "border-slate-600/70 bg-slate-800/70 text-slate-200"
  );
}

function getDetailBinaryPillClass(active: boolean): string {
  return cn(
    DETAIL_COMPACT_PILL_BASE_CLASS,
    active
      ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
      : "border-slate-500/40 bg-slate-800/70 text-slate-300"
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
type AppRole = "owner" | "admin" | "accountant" | "staff" | "client" | "guest";

function normalizeRole(raw: any): AppRole {
  if (!raw) return "guest";
  const r = String(raw).toLowerCase();

  if (r.includes("owner")) return "owner";
  if (r.includes("admin")) return "admin";
  if (r.includes("account")) return "accountant";
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
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const [internalNotes, setInternalNotes] = useState("");

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
  const [requestedRequestId, setRequestedRequestId] = useState(() => {
    if (typeof window === "undefined") return "";
    return (
      new URLSearchParams(window.location.search).get("requestId")?.trim() || ""
    );
  });

  const clearRequestedRequestId = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("requestId");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
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

  const openMessageDetails = async (rawMessage: any) => {
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

    setIsDetailDialogOpen(true);
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
    if (!isDetailDialogOpen || !selectedMessage?.id) return;

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
  }, [isDetailDialogOpen, selectedMessage?.id]);

  useEffect(() => {
    if (
      !isDetailDialogOpen ||
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
    isDetailDialogOpen,
    selectedMessage?.id,
    selectedMessage?.adminSeenAt,
    user?.uid,
    user?.email,
  ]);

  useEffect(() => {
    if (!isDetailDialogOpen || !activeInvestmentId) return;

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
  }, [isDetailDialogOpen, activeInvestmentId]);

  useEffect(() => {
    if (!isDetailDialogOpen) return;
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
  }, [isDetailDialogOpen, activeContractId]);

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
    if (!requestedRequestId || !normalized.length || isDetailDialogOpen) return;

    const target = normalized.find(
      message => String(message?.id || "").trim() === requestedRequestId
    );
    if (!target) return;

    setRequestedRequestId("");
    clearRequestedRequestId();
    void openMessageDetails(target);
  }, [
    requestedRequestId,
    normalized,
    isDetailDialogOpen,
    clearRequestedRequestId,
    openMessageDetails,
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
      const interestReviewMeta =
        requestKind.key === "interest" ? getInterestReviewMeta(message) : null;
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
          stageMeta.label,
          client.sourceLabel,
          requestKind.label,
          requestKind.shortLabel,
          interestReviewMeta?.label
        ),
      };
    });

    return rows.sort((a, b) => {
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
        request.interestReviewMeta || getInterestReviewMeta(request);
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

            <Badge
              className={cn(
                "border px-3 py-1 text-[11px] font-semibold shadow-none",
                reviewMeta.tone
              )}
            >
              {reviewMeta.label}
            </Badge>
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
              onClick={() => void openMessageDetails(request)}
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

          <Badge
            className={cn(
              "border px-3 py-1 text-[11px] font-semibold shadow-none",
              request.statusMeta.tone
            )}
          >
            {request.statusMeta.label}
          </Badge>
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
            onClick={() => void openMessageDetails(request)}
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
        ? getInterestReviewMeta(selectedMessage)
        : null,
    [selectedMessage, selectedRequestKind]
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

  /* =========================
    moveTo step helper
  ========================= */
  const moveTo = async (next: {
    status: MessageStatus;
    stageRole: StageRole;
    note?: string;
    notifyClientText?: string;
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
              ...actionMeta(user, myRole),
            });
          }),
      });

      toast.success("تم الترحيل النهائي ✅");
      setIsDetailDialogOpen(false);
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
              ...actionMeta(user, myRole),
            });
          }),
      });

      toast.success("تم التحقق من العقد الموقّع.");
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
              ...actionMeta(user, myRole),
            });
          }),
      });

      toast.success("تم اعتماد العقد وتفعيل الاستثمار");
      setIsDetailDialogOpen(false);
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
      setIsDetailDialogOpen(false);
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
      setIsDetailDialogOpen(false);
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

  const startRequestReview = async () => {
    if (!selectedMessage) return;
    if (!canStartRequestReview)
      return toast.error("لا تملك صلاحية بدء مراجعة الطلب.");
    await moveTo({
      status: "reviewing",
      stageRole: "review",
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
          ...actionMeta(user, myRole),
        },
        action: AUDIT_ACTIONS.REQUEST_INITIAL_APPROVED,
        category: "request",
        entityType: "request",
        source: messagesAuditSource("initial_approve_request"),
        relatedIds: { requestId: selectedMessage.id },
        message: `Initially approved request ${selectedMessage.id}`,
      });

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

  /* =========================
     Render
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_70px_-42px_rgba(15,23,42,0.42)]">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.66),transparent_55%)]" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex w-fit items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-teal-700">
                سجل تشغيلي مباشر
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  سجل طلبات الاستثمار
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  عرض مؤسسي سريع القراءة يعتمد على سجل الطلب الحالي وبيانات
                  العميل المحدثة مباشرة من ملف المستخدم في Firestore.
                </p>
              </div>
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
              <h1 className="text-4xl font-bold mb-2">سجل طلبات الاستثمار</h1>
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
                    سجل طلبات الاستثمار
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
                سجل طلبات الاستثمار
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
                    سجل طلبات الاستثمار
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
                                  onClick={() => void openMessageDetails(m)}
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

        {/* Detail dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent
            className={`flex w-[98vw] max-w-[1400px] flex-col gap-0 p-0 max-h-[92vh] overflow-hidden 2xl:max-w-[1600px] ${DETAIL_DIALOG_PANEL_CLASS}`}
            dir="rtl"
          >
            <DialogHeader className="shrink-0 border-b border-white/10 bg-white/[0.05] px-7 py-5 backdrop-blur-xl">
              <DialogTitle className="text-2xl font-semibold tracking-tight text-slate-50">
                تفاصيل الطلب
              </DialogTitle>
            </DialogHeader>

            {selectedMessage ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="space-y-6 p-6 sm:p-7">
                  <div className="grid grid-cols-1 gap-5">
                    <Card className={`rsg-card ${DETAIL_SECTION_CARD_CLASS}`}>
                      <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
                        <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>
                          بيانات العميل
                        </CardTitle>
                      </CardHeader>
                      <CardContent className={DETAIL_SECTION_CONTENT_CLASS}>
                        {(() => {
                          const emailValue = selectedClient?.clientEmail;
                          const phoneValue = selectedClient?.clientPhone;

                          const contactValue =
                            emailValue && phoneValue ? (
                              <span dir="ltr" className="break-all">
                                {emailValue} • {phoneValue}
                              </span>
                            ) : emailValue ? (
                              <span dir="ltr" className="break-all">
                                {emailValue}
                              </span>
                            ) : phoneValue ? (
                              <span dir="ltr">{phoneValue}</span>
                            ) : (
                              "â€”"
                            );

                          const contactDisplayValue =
                            emailValue && phoneValue ? (
                              <span dir="ltr" className="break-all">
                                {emailValue} / {phoneValue}
                              </span>
                            ) : emailValue ? (
                              <span dir="ltr" className="break-all">
                                {emailValue}
                              </span>
                            ) : phoneValue ? (
                              <span dir="ltr">{phoneValue}</span>
                            ) : (
                              "-"
                            );

                          return (
                            <>
                              <InfoRow
                                label="الاسم"
                                value={selectedClient?.clientName || "—"}
                              />
                              <InfoRow
                                label="البريد / الجوال"
                                value={contactDisplayValue}
                              />
                              {false ? (
                                <>
                                  <InfoRow
                                    label="الاسم"
                                    value={selectedClient?.clientName || "—"}
                                  />
                                  <InfoRow
                                    label="البريد"
                                    value={selectedClient?.clientEmail || "—"}
                                  />
                                  <InfoRow
                                    label="الجوال"
                                    value={selectedClient?.clientPhone || "—"}
                                  />
                                </>
                              ) : null}

                              {selectedClient ? (
                                <div className={DETAIL_ALERT_CLASS}>
                                  {selectedClient.sourceHelper}
                                </div>
                              ) : null}

                              {false ? (
                                <>
                                  <InfoRow
                                    label="الاسم"
                                    value={
                                      getClientName(selectedMessage) || "—"
                                    }
                                  />
                                  <InfoRow
                                    label="البريد"
                                    value={
                                      getClientEmail(selectedMessage) || "—"
                                    }
                                  />
                                  <InfoRow
                                    label="الجوال"
                                    value={
                                      getClientPhone(selectedMessage) || "—"
                                    }
                                  />
                                </>
                              ) : null}

                              <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
                                {(() => {
                                  const clientId = pick(
                                    selectedClient?.clientId,
                                    selectedMessage?.createdByUid,
                                    selectedMessage?.investorUid,
                                    selectedMessage?.userId,
                                    selectedMessage?.userSnapshot?.uid
                                  );

                                  const pid = pick(
                                    selectedMessage?.projectId,
                                    selectedMessage?.project_id,
                                    selectedMessage?.project?.id
                                  );

                                  return (
                                    <>
                                      <Button
                                        variant="outline"
                                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                                        onClick={() => {
                                          if (!clientId) {
                                            toast.warning(
                                              "لا يوجد حساب عميل مرتبط بهذا الطلب."
                                            );
                                            return;
                                          }
                                          window.location.href = `/admin/client-profile?id=${clientId}`;
                                        }}
                                      >
                                        <FileText className="w-4 h-4" />
                                        فتح ملف العميل
                                      </Button>

                                      <Button
                                        variant="outline"
                                        className={DETAIL_OUTLINE_BUTTON_CLASS}
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
                                        <ExternalLink className="w-4 h-4" />
                                        فتح المشروع
                                      </Button>
                                    </>
                                  );
                                })()}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
                                {(() => {
                                  const emailToUse =
                                    selectedClient?.clientEmail ||
                                    getClientEmail(selectedMessage);
                                  const phoneToUse =
                                    selectedClient?.clientPhone ||
                                    getClientPhone(selectedMessage);

                                  return (
                                    <>
                                      {emailToUse ? (
                                        <a
                                          className="inline-flex"
                                          href={`mailto:${emailToUse}`}
                                        >
                                          <Button
                                            variant="outline"
                                            className={
                                              DETAIL_OUTLINE_BUTTON_CLASS
                                            }
                                          >
                                            <Mail className="w-4 h-4" />
                                            إيميل
                                          </Button>
                                        </a>
                                      ) : null}

                                      {phoneToUse ? (
                                        <a
                                          className="inline-flex"
                                          href={`tel:${phoneToUse}`}
                                        >
                                          <Button
                                            variant="outline"
                                            className={
                                              DETAIL_OUTLINE_BUTTON_CLASS
                                            }
                                          >
                                            <Phone className="w-4 h-4" />
                                            اتصال
                                          </Button>
                                        </a>
                                      ) : null}
                                    </>
                                  );
                                })()}
                              </div>
                            </>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    <Card className={`rsg-card ${DETAIL_SECTION_CARD_CLASS}`}>
                      <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
                        <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>
                          ملخص الطلب
                        </CardTitle>
                      </CardHeader>
                      <CardContent className={DETAIL_SECTION_CONTENT_CLASS}>
                        {(() => {
                          const pid = pick(
                            selectedMessage?.projectId,
                            selectedMessage?.project_id,
                            selectedMessage?.project?.id
                          );

                          const projectTitle = getProjectTitle(pid);

                          const amount =
                            toNum(selectedMessage?.approvedAmount) ||
                            toNum(selectedMessage?.amount) ||
                            toNum(selectedMessage?.requestedAmount) ||
                            toNum(selectedMessage?.estimatedAmount) ||
                            0;

                          const remaining = getProjectRemaining(pid);
                          const exceeded =
                            remaining != null ? amount > remaining : false;

                          const invState = selectedMessage?.investmentId
                            ? "تم إنشاء الاستثمار"
                            : "بانتظار إنشاء الاستثمار";

                          if (isSelectedInterestRequest) {
                            return (
                              <>
                                <InfoRow
                                  label="رقم الطلب"
                                  value={requestNumber(selectedMessage)}
                                />
                                <InfoRow
                                  label="اسم المشروع"
                                  value={projectTitle}
                                />
                                <InfoRow
                                  label="نوع الطلب"
                                  value="طلب اهتمام"
                                />
                                <InfoRow
                                  label="حالة الاهتمام"
                                  value={
                                    selectedInterestReviewMeta?.label || "جديد"
                                  }
                                />
                                <InfoRow
                                  label="رسالة الاهتمام"
                                  value={
                                    selectedMessage?.message ||
                                    selectedMessage?.body ||
                                    selectedMessage?.description ||
                                    selectedMessage?.details ||
                                    selectedMessage?.note ||
                                    selectedMessage?.requestText ||
                                    "لا توجد رسالة مرفقة"
                                  }
                                />
                                <InfoRow
                                  label="التاريخ"
                                  value={formatDateTimeAR(
                                    selectedMessage.createdAt ||
                                      selectedMessage.created_at ||
                                      selectedMessage.submittedAt ||
                                      selectedMessage.timestamp
                                  )}
                                />
                              </>
                            );
                          }

                          return (
                            <>
                              <InfoRow
                                label="رقم الطلب"
                                value={requestNumber(selectedMessage)}
                              />
                              <InfoRow
                                label="اسم المشروع"
                                value={projectTitle}
                              />
                              <InfoRow
                                label="المبلغ"
                                value={moneySAR(amount)}
                              />
                              <InfoRow
                                label="المتبقي"
                                value={
                                  remaining == null
                                    ? "—"
                                    : exceeded
                                      ? `${moneySAR(remaining)} (تجاوز)`
                                      : moneySAR(remaining)
                                }
                              />
                              <InfoRow label="الاستثمار" value={invState} />
                              <InfoRow
                                label="التاريخ"
                                value={formatDateTimeAR(
                                  selectedMessage.createdAt ||
                                    selectedMessage.created_at ||
                                    selectedMessage.submittedAt ||
                                    selectedMessage.timestamp
                                )}
                              />
                            </>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    <Card className={`rsg-card ${DETAIL_SECTION_CARD_CLASS}`}>
                      <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
                        <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>
                          الحالة
                        </CardTitle>
                      </CardHeader>
                      <CardContent
                        className={`${DETAIL_SECTION_CONTENT_CLASS} space-y-5`}
                      >
                        <div
                          className={cn(
                            DETAIL_INLINE_PANEL_CLASS,
                            "flex flex-wrap items-center gap-2.5"
                          )}
                        >
                          <Badge
                            className={
                              isSelectedInterestRequest
                                ? cn(
                                    DETAIL_PILL_BASE_CLASS,
                                    selectedInterestReviewMeta?.tone
                                  )
                                : getDetailRequestStatusClass(
                                    selectedMessage.status
                                  )
                            }
                          >
                            {isSelectedInterestRequest
                              ? selectedInterestReviewMeta?.label || "جديد"
                              : getStatusBadge(selectedMessage.status).label}
                          </Badge>
                          {isSelectedInterestRequest ? null : (
                            <Badge className={DETAIL_STAGE_PILL_CLASS}>
                              {stageLabel(selectedMessage.stageRole)}
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
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
                          </div>
                        </div>

                        {isSelectedInterestRequest ? (
                          <div className={DETAIL_ALERT_CLASS}>
                            {selectedInterestReviewMeta?.helperText ||
                              "يتم نقل الاهتمام إلى السجل القديم مباشرة بعد الاطلاع عليه، بدون دورة إجراءات استثمارية."}
                          </div>
                        ) : null}

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

                          {/* ✅ Step Machine Buttons */}
                          {selectedMessage ? (
                            <>
                              {/* 1) Staff -> Accountant */}
                              {false &&
                              canStaffActions &&
                              normalizeForDisplay(selectedMessage).status ===
                                "new" &&
                              normalizeForDisplay(selectedMessage).stageRole ===
                                "staff" ? (
                                <Button
                                  className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-yellow-700 hover:bg-yellow-800`}
                                  onClick={stepStaffForwardToAccountant}
                                  disabled={isLockedFinal}
                                >
                                  <Clock3 className="w-4 h-4" />
                                  ترحيل للمحاسب
                                </Button>
                              ) : null}

                              {/* 2) Accountant -> Client */}
                              {false &&
                              canOwnerAccountantActions &&
                              normalizeForDisplay(selectedMessage).status ===
                                "needs_account" &&
                              normalizeForDisplay(selectedMessage).stageRole ===
                                "accountant" ? (
                                <Button
                                  className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-indigo-700 hover:bg-indigo-800`}
                                  onClick={stepAccountantForwardToClient}
                                  disabled={isLockedFinal}
                                >
                                  <PenLine className="w-4 h-4" />
                                  تمّت المراجعة — للعميل
                                </Button>
                              ) : null}

                              {/* 3) Client -> Owner */}
                              {false &&
                              myRole === "client" &&
                              normalizeForDisplay(selectedMessage).status ===
                                "waiting_client_confirmation" &&
                              normalizeForDisplay(selectedMessage).stageRole ===
                                "client" ? (
                                <Button
                                  className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-emerald-700 hover:bg-emerald-800`}
                                  onClick={stepClientApproveAndForwardToOwner}
                                  disabled={isLockedFinal}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  موافقة وتعميد
                                </Button>
                              ) : null}

                              {/* 4) Owner -> Completed/Locked */}
                              {false &&
                              myRole === "owner" &&
                              normalizeForDisplay(selectedMessage).status ===
                                "resolved" &&
                              normalizeForDisplay(selectedMessage).stageRole ===
                                "owner" ? (
                                <Button
                                  className={`${DETAIL_SOLID_BUTTON_CLASS} w-full bg-gray-800 hover:bg-gray-900`}
                                  onClick={stepOwnerFinalizeAndClose}
                                  disabled={isLockedFinal}
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                  تعميد نهائي وإقفال
                                </Button>
                              ) : null}
                            </>
                          ) : null}

                          {/* ✅ Staff: Pre-investment */}
                          {false && isInvestment ? (
                            <Button
                              variant="outline"
                              className={cn(
                                DETAIL_OUTLINE_BUTTON_CLASS,
                                "w-full"
                              )}
                              onClick={createPreInvestment}
                              disabled={isLockedFinal}
                            >
                              <PenLine className="w-4 h-4" />
                              إنشاء الاستثمار (قديم)
                            </Button>
                          ) : null}

                          {/* ✅ Finalize */}
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

                          {false && canApproveAndCreateInvestment ? (
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
                              قبول الطلب وإنشاء الاستثمار
                            </Button>
                          ) : null}

                          {/* ✅ Reject */}
                          <Button
                            className={cn(
                              DETAIL_DANGER_BUTTON_CLASS,
                              "w-full",
                              !isSelectedInvestmentRequest && "hidden"
                            )}
                            onClick={rejectInvestmentRequest}
                            disabled={isLockedFinal || !canManageMessages}
                          >
                            <AlertTriangle className="w-4 h-4" />
                            رفض الطلب
                          </Button>

                          {/* ✅ Owner only reopen */}
                          <Button
                            variant="outline"
                            className={cn(
                              DETAIL_OUTLINE_BUTTON_CLASS,
                              "w-full",
                              !isSelectedInvestmentRequest && "hidden"
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
                        </div>
                      </CardContent>
                    </Card>

                    <Card className={`rsg-card ${DETAIL_SECTION_CARD_CLASS}`}>
                      <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
                        <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>
                          مستندات الاستثمار (Cloudflare R2)
                        </CardTitle>
                      </CardHeader>
                      <CardContent
                        className={`${DETAIL_SECTION_CONTENT_CLASS} space-y-5`}
                      >
                        <InfoRow
                          label="رقم الاستثمار"
                          value={String(selectedMessage?.investmentId || "-")}
                        />

                        <div className={DETAIL_INLINE_PANEL_CLASS}>
                          <div className={DETAIL_INLINE_LABEL_CLASS}>
                            حالة العقد
                          </div>
                          <div className="flex items-center flex-wrap gap-2">
                            <span
                              className={`${DETAIL_PILL_BASE_CLASS} ${getContractStatusClass(
                                contractStatusValue
                              )}`}
                            >
                              {getContractStatusLabel(contractStatusValue)}
                            </span>
                            {contractFollowupChipLabel ? (
                              <span
                                className={`${DETAIL_PILL_BASE_CLASS} border-amber-300/35 bg-amber-500/10 text-amber-200`}
                              >
                                {contractFollowupChipLabel}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className={DETAIL_SUBCARD_CLASS}>
                            <div className="flex items-center justify-between gap-2">
                              <div className={DETAIL_SUBCARD_TITLE_CLASS}>
                                العقد الأصلي
                              </div>
                              <span
                                className={getDetailBinaryPillClass(
                                  hasOriginalContract
                                )}
                              >
                                {hasOriginalContract ? "مرفوع" : "لا يوجد"}
                              </span>
                            </div>

                            {hasOriginalContract ? (
                              <>
                                <div className={DETAIL_SUBCARD_VALUE_CLASS}>
                                  {originalContractFileName}
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {originalContractViewUrl ? (
                                    <a
                                      href={originalContractViewUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                                      >
                                        <Eye className="w-4 h-4" />
                                        عرض
                                      </Button>
                                    </a>
                                  ) : null}
                                  {originalContractDownloadUrl ? (
                                    <a
                                      href={originalContractDownloadUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                                      >
                                        <Download className="w-4 h-4" />
                                        تنزيل
                                      </Button>
                                    </a>
                                  ) : null}
                                </div>
                                {needsFreshSignedContract ? (
                                  <div className={DETAIL_ALERT_CLASS}>
                                    تم تحديث العقد الأصلي، وسيحتاج المستثمر إلى
                                    توقيع النسخة الجديدة.
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div className={DETAIL_HELP_TEXT_CLASS}>
                                لا يوجد
                              </div>
                            )}
                          </div>

                          <div className={DETAIL_SUBCARD_CLASS}>
                            <div className="flex items-center justify-between gap-2">
                              <div className={DETAIL_SUBCARD_TITLE_CLASS}>
                                العقد الموقّع
                              </div>
                              <span
                                className={getDetailBinaryPillClass(
                                  hasCurrentSignedContract
                                )}
                              >
                                {hasCurrentSignedContract ? "مرفوع" : "لا يوجد"}
                              </span>
                            </div>

                            {hasCurrentSignedContract ? (
                              <>
                                <div className={DETAIL_SUBCARD_VALUE_CLASS}>
                                  {signedContractFileName}
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {signedContractViewUrl ? (
                                    <a
                                      href={signedContractViewUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                                      >
                                        <Eye className="w-4 h-4" />
                                        عرض
                                      </Button>
                                    </a>
                                  ) : null}
                                  {signedContractDownloadUrl ? (
                                    <a
                                      href={signedContractDownloadUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                                      >
                                        <Download className="w-4 h-4" />
                                        تنزيل
                                      </Button>
                                    </a>
                                  ) : null}
                                </div>
                              </>
                            ) : (
                              <div className={DETAIL_HELP_TEXT_CLASS}>
                                {needsFreshSignedContract
                                  ? "لم يتم رفع عقد موقّع من المستثمر بعد."
                                  : "لم يتم رفع العقد الموقّع بعد"}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-white/10 pt-5">
                          <div className={DETAIL_INLINE_LABEL_CLASS}>
                            رفع المستندات
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-4 rounded-[22px] border border-dashed border-slate-700/70 bg-slate-950/35 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                              <ContractFilePicker
                                buttonLabel="رفع العقد الأصلي (PDF)"
                                file={draftFile}
                                onFileChange={setDraftFile}
                                panelClassName="rounded-[18px] border-slate-700/70 bg-slate-950/55 px-4 py-4 sm:px-4"
                                buttonClassName={DETAIL_OUTLINE_BUTTON_CLASS}
                                fileNameClassName="text-sm font-semibold text-slate-50"
                                helperTextClassName="text-xs leading-6 text-slate-300"
                                disabled={
                                  contractBusy || !selectedMessage?.investmentId
                                }
                              />
                              <Button
                                className={`w-full ${DETAIL_SOLID_BUTTON_CLASS} bg-blue-700 hover:bg-blue-800`}
                                onClick={createContractForInvestment}
                                disabled={
                                  contractBusy ||
                                  !selectedMessage?.investmentId ||
                                  !draftFile ||
                                  !canAdmin
                                }
                              >
                                {contractBusy ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                                رفع العقد الأصلي
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter className="shrink-0 border-t border-white/10 bg-white/[0.05] px-7 py-5 backdrop-blur-xl">
              <div className="flex items-center justify-between w-full gap-3">
                <div className="text-xs text-slate-300">
                  {isLockedFinal
                    ? "هذا الطلب مقفل."
                    : "تأكد من حفظ التغييرات بعد أي تعديل."}
                </div>

                <Button
                  variant="outline"
                  className={DETAIL_OUTLINE_BUTTON_CLASS}
                  onClick={() => setIsDetailDialogOpen(false)}
                >
                  إغلاق
                </Button>
              </div>
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
